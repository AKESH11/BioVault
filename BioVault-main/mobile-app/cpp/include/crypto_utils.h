#ifndef CRYPTO_UTILS_H
#define CRYPTO_UTILS_H

#include <string>
#include <vector>
#include <cstdint>

namespace biovault {
namespace crypto {

/**
 * @brief Cryptographic utility functions for Bio-Vault
 */
class CryptoUtils {
public:
    /**
     * @brief Generate Bio-Vault hash combining frame, biometrics, and hardware ID
     * @param frameData Raw frame data
     * @param bpm Heart rate (BPM)
     * @param hardwareID Hardware fingerprint
     * @param timestamp Unix timestamp
     * @return BLAKE3 hash string
     */
    static std::string generateBioVaultHash(
        const std::vector<uint8_t>& frameData,
        int bpm,
        const std::string& hardwareID,
        uint64_t timestamp
    );

    /**
     * @brief Generate SHA-256 hash
     * @param data Input data
     * @return Hex-encoded hash
     */
    static std::string sha256(const std::vector<uint8_t>& data);

    /**
     * @brief Generate BLAKE3 hash (faster than SHA-256)
     * @param data Input data
     * @return Hex-encoded hash
     */
    static std::string blake3(const std::vector<uint8_t>& data);

    /**
     * @brief Build multi-sig hash over FrameData + BPM + Signature (BLAKE3)
     * @param frameData Raw frame or frame-hash bytes
     * @param bpm Heart rate (BPM)
     * @param signature Ed25519 signature bytes (64 bytes expected)
     * @return Hex-encoded BLAKE3 hash (32 bytes -> 64 hex chars)
     */
    static std::string generateMultiSigHash(
        const std::vector<uint8_t>& frameData,
        int bpm,
        const std::vector<uint8_t>& signature
    );

    /**
     * @brief Generate Ed25519 signature
     * @param data Data to sign
     * @param privateKey Private key (32 bytes)
     * @return Signature (64 bytes)
     */
    static std::vector<uint8_t> signEd25519(
        const std::vector<uint8_t>& data,
        const std::vector<uint8_t>& privateKey
    );

    /**
     * @brief Verify Ed25519 signature
     * @param data Original data
     * @param signature Signature to verify
     * @param publicKey Public key (32 bytes)
     * @return True if signature is valid
     */
    static bool verifyEd25519(
        const std::vector<uint8_t>& data,
        const std::vector<uint8_t>& signature,
        const std::vector<uint8_t>& publicKey
    );

    /**
     * @brief Convert byte vector to hex string
     */
    static std::string toHex(const std::vector<uint8_t>& data);

    /**
     * @brief Convert hex string to byte vector
     */
    static std::vector<uint8_t> fromHex(const std::string& hex);

    /**
     * @brief Get current Unix timestamp in milliseconds
     */
    static uint64_t getCurrentTimestamp();
};

} // namespace crypto
} // namespace biovault

#endif // CRYPTO_UTILS_H
