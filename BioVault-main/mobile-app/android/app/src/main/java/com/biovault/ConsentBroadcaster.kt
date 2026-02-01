package com.biovault

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import java.nio.charset.StandardCharsets
import java.util.UUID

/**
 * BLE advertiser for the Bio-Vault P2P consent handshake.
 * Broadcasts a compact consent request so the peer can discover and then connect (GATT) to exchange signatures.
 */
class ConsentBroadcaster(context: Context) {
    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter = bluetoothManager.adapter
    private val advertiser: BluetoothLeAdvertiser? = adapter.bluetoothLeAdvertiser

    // Stable service UUID used for discovery
    private val serviceUuid: ParcelUuid = ParcelUuid(UUID.fromString("12345678-1234-1234-1234-1234567890ab"))

    private var currentCallback: AdvertiseCallback? = null

    /**
     * Start advertising a consent request.
     * Keep payload ≤ 31 bytes for legacy advertising (fits in AdvData).
     */
    fun startConsentAdvert(pulseBpm: Int, sessionId: String) {
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

    fun stopConsentAdvert() {
        currentCallback?.let { advertiser?.stopAdvertising(it) }
        currentCallback = null
    }
}
