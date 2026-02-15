package com.biovault

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE advertiser + scanner for the Bio-Vault P2P consent handshake.
 * Broadcasts a compact consent request and listens for N peer signatures.
 */
class ConsentBroadcaster(private val context: Context) {
    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter = bluetoothManager.adapter
    private val advertiser: BluetoothLeAdvertiser? = adapter.bluetoothLeAdvertiser
    private val scanner: BluetoothLeScanner? = adapter.bluetoothLeScanner

    // Stable service UUID used for discovery
    private val serviceUuid: ParcelUuid = ParcelUuid(UUID.fromString("12345678-1234-1234-1234-1234567890ab"))

    // Consensus session management
    private var activeSessionId: String? = null
    private val receivedSignatures = ConcurrentHashMap<Int, BLESignatureData>()
    private val handler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null
    private var consensusCallback: ConsensusCallback? = null

    companion object {
        private const val TAG = "ConsentBroadcaster"
        private const val TIMEOUT_MS = 5000L // 5 seconds
    }

    data class BLESignatureData(
        val faceId: Int,
        val bpm: Int,
        val signature: ByteArray,
        val publicKey: ByteArray
    )

    interface ConsensusCallback {
        fun onConsensusComplete(consensusHash: String, signatures: List<BLESignatureData>)
        fun onConsensusTimeout(receivedCount: Int, expectedCount: Int)
    }

    /**
     * Start a consensus session: advertise and listen for N signatures
     * @param sessionId Unique session identifier
     * @param expectedFaceCount Number of faces detected (N)
     * @param myBpm Local user's BPM
     * @param callback Callback for consensus result
     */
    fun startConsensusSession(
        sessionId: String,
        expectedFaceCount: Int,
        myBpm: Int,
        callback: ConsensusCallback
    ) {
        activeSessionId = sessionId
        receivedSignatures.clear()
        consensusCallback = callback

        // Start advertising
        startConsentAdvert(myBpm, sessionId)

        // Start scanning for peer signatures
        startScanning()

        // Set timeout
        timeoutRunnable = Runnable {
            handleTimeout(expectedFaceCount)
        }
        handler.postDelayed(timeoutRunnable!!, TIMEOUT_MS)

        Log.d(TAG, "Consensus session started: $sessionId, expecting $expectedFaceCount signatures")
    }

    /**
     * Stop the consensus session
     */
    fun stopConsensusSession() {
        stopConsentAdvert()
        stopScanning()
        timeoutRunnable?.let { handler.removeCallbacks(it) }
        activeSessionId = null
        receivedSignatures.clear()
        Log.d(TAG, "Consensus session stopped")
    }

    /**
     * Receive a BLE signature from a peer
     * Called when scanner detects a peer's signature broadcast
     */
    fun receivePeerSignature(sigData: BLESignatureData) {
        if (activeSessionId == null) {
            Log.w(TAG, "Received signature but no active session")
            return
        }

        receivedSignatures[sigData.faceId] = sigData
        Log.d(TAG, "Received signature for faceId=${sigData.faceId}, total=${receivedSignatures.size}")

        // Check if we have all signatures (this would be determined by expected count from camera)
        // For now, we rely on timeout or external trigger
    }

    private fun handleTimeout(expectedCount: Int) {
        val receivedCount = receivedSignatures.size
        Log.d(TAG, "Consensus timeout: received $receivedCount/$expectedCount signatures")

        if (receivedCount < expectedCount) {
            consensusCallback?.onConsensusTimeout(receivedCount, expectedCount)
        } else {
            // All signatures received, finalize consensus
            finalizeConsensus()
        }

        stopConsensusSession()
    }

    /**
     * Finalize the consensus and compute the hash via JNI (C++ BLAKE3 multi-sig)
     */
    private fun finalizeConsensus() {
        val signatures = receivedSignatures.values.toList()
        
        // Call BioVaultModule's static JNI bridge to compute consensus hash in C++
        val consensusHash = BioVaultModule.computeConsensusHashStatic(
            activeSessionId ?: "",
            signatures
        )
        
        consensusCallback?.onConsensusComplete(
            if (consensusHash.isNullOrEmpty()) "consensus_error" else consensusHash,
            signatures
        )
    }

    private var currentCallback: AdvertiseCallback? = null

    /**
     * Start advertising a consent request.
     * Keep payload ≤ 31 bytes for legacy advertising (fits in AdvData).
     */
    private fun startConsentAdvert(pulseBpm: Int, sessionId: String) {
        if (advertiser == null || !adapter.isEnabled) return

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true) // allow GATT follow-up
            .build()

        val payload = "CONSENT|$sessionId|$pulseBpm".toByteArray(StandardCharsets.UTF_8)

        val data = AdvertiseData.Builder()
            .addServiceUuid(serviceUuid)
            .addServiceData(serviceUuid, payload)
            .build()

        val cb = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                // Optionally log or notify UI
            }
            override fun onStartFailure(errorCode: Int) {
                // Optionally log/notify
            }
        }
        currentCallback = cb
        advertiser.startAdvertising(settings, data, cb)
    }

    private var scanCallback: ScanCallback? = null

    /**
     * Start scanning for peer signatures
     */
    private fun startScanning() {
        if (scanner == null || !adapter.isEnabled) return

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(serviceUuid)
            .build()

        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                handleScanResult(result)
            }

            override fun onBatchScanResults(results: List<ScanResult>) {
                results.forEach { handleScanResult(it) }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "BLE scan failed: $errorCode")
            }
        }

        scanCallback = cb
        scanner.startScan(listOf(scanFilter), scanSettings, cb)
        Log.d(TAG, "Started BLE scanning for peer signatures")
    }

    private fun stopScanning() {
        scanCallback?.let { scanner?.stopScan(it) }
        scanCallback = null
    }

    private fun handleScanResult(result: ScanResult) {
        val scanRecord = result.scanRecord ?: return
        val serviceData = scanRecord.getServiceData(serviceUuid) ?: return

        try {
            // Parse payload: "CONSENT|sessionId|bpm" or "SIG|faceId|bpm|signature"
            val payload = String(serviceData, StandardCharsets.UTF_8)
            val parts = payload.split("|")

            if (parts[0] == "SIG" && parts.size >= 4) {
                val faceId = parts[1].toInt()
                val bpm = parts[2].toInt()
                val sigHex = parts[3]
                
                // Decode signature (simplified - real implementation needs proper encoding)
                val signature = hexToBytes(sigHex)
                val publicKey = ByteArray(32) // TODO: Extract from GATT or scan data

                val sigData = BLESignatureData(faceId, bpm, signature, publicKey)
                receivePeerSignature(sigData)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse scan result: ${e.message}")
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val len = hex.length
        val data = ByteArray(len / 2)
        for (i in 0 until len step 2) {
            data[i / 2] = ((Character.digit(hex[i], 16) shl 4)
                    + Character.digit(hex[i + 1], 16)).toByte()
        }
        return data
    }

    fun stopConsentAdvert() {
        currentCallback?.let { advertiser?.stopAdvertising(it) }
        currentCallback = null
    }
}
