package com.biovault

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * StrongBoxManager
 * - Detects StrongBox availability
 * - Generates an EC P-256 key pair inside AndroidKeyStore backed by StrongBox (when available)
 * - Requires biometric auth for every signature
 * - Signs caller-provided 32-byte hashes (no additional hashing performed)
 * - Provides JNI bridge for C++ Bio-Vault core
 */
class StrongBoxManager(private val context: Context) {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val REALITY_KEY_ALIAS = "biovault_reality_key"
        
        init {
            System.loadLibrary("BioVaultCore")
        }
    }
    
    // Native JNI methods
    private external fun initializeNativeBridge(strongBoxManager: StrongBoxManager)
    private external fun cleanupNativeBridge()
    
    init {
        // Initialize JNI bridge so C++ can call back to Kotlin
        initializeNativeBridge(this)
    }

    /**
     * @return true if device advertises StrongBox hardware keystore support
     */
    fun isStrongBoxSupported(): Boolean {
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
    }

    /**
     * Generates an EC P-256 key pair in AndroidKeyStore, preferring StrongBox.
     * Requires biometric authentication for every signature operation.
     */
    fun generateRealityKey(): Boolean {
        return try {
            val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)

            val builder = KeyGenParameterSpec.Builder(
                REALITY_KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                // Require per-use biometric authentication
                .setUserAuthenticationRequired(true)
                .setDigests(KeyProperties.DIGEST_NONE)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(
                    0,
                    KeyProperties.AUTH_BIOMETRIC_STRONG
                )
            } else {
                // Fallback: require auth for every use (0 seconds validity)
                builder.setUserAuthenticationValidityDurationSeconds(0)
            }

            // Request StrongBox if available; gracefully fall back if not
            if (isStrongBoxSupported()) {
                try {
                    builder.setIsStrongBoxBacked(true)
                } catch (e: Exception) {
                    // Some devices advertise StrongBox but disallow backing certain key types
                }
            }

            kpg.initialize(builder.build())
            kpg.generateKeyPair()
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Sign a 32-byte hash using the StrongBox-backed private key.
     * The input is treated as a pre-computed hash; no additional hashing is done.
     * 
     * This method is called from C++ via JNI when Bio-Vault hash is ready.
     * Requires biometric authentication to unlock the private key.
     */
    fun signHash(data: ByteArray): ByteArray {
        require(data.size == 32) { "signHash expects a 32-byte hash" }

        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val entry = keyStore.getEntry(REALITY_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
            ?: throw IllegalStateException("Reality key not generated. Call generateRealityKey() first.")

        // Use raw ECDSA (no hash) since the caller supplies a pre-hashed digest
        val signature = Signature.getInstance("NONEwithECDSA")
        signature.initSign(entry.privateKey)
        signature.update(data)
        return signature.sign()
    }
    
    /**
     * Get the public key for verification
     */
    fun getPublicKey(): ByteArray {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val entry = keyStore.getEntry(REALITY_KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
            ?: throw IllegalStateException("Reality key not generated")
        
        return entry.certificate.publicKey.encoded
    }
    
    /**
     * Check if reality key exists
     */
    fun hasRealityKey(): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            keyStore.containsAlias(REALITY_KEY_ALIAS)
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Cleanup when destroying StrongBoxManager
     */
    fun destroy() {
        cleanupNativeBridge()
    }
}
