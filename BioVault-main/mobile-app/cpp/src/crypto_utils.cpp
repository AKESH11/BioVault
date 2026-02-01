#include "crypto_utils.h"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <cstring>
#include <iostream>

// Production cryptography libraries
#ifdef HAVE_OPENSSL
#include <openssl/sha.h>
#include <openssl/evp.h>
#endif

#ifdef HAVE_LIBSODIUM
#include <sodium.h>
#endif

#ifdef HAVE_BLAKE3
#include <blake3.h>
#endif

namespace biovault {
namespace crypto {

// Initialize libsodium once
static bool sodiumInitialized = false;

void ensureSodiumInit() {
#ifdef HAVE_LIBSODIUM
    if (!sodiumInitialized) {
        if (sodium_init() < 0) {
            std::cerr << "ERROR: libsodium initialization failed!" << std::endl;
        } else {
            sodiumInitialized = true;
        }
    }
#endif
}

std::string CryptoUtils::generateBioVaultHash(
    const std::vector<uint8_t>& frameData,
    int bpm,
    const std::string& hardwareID,
    uint64_t timestamp)
{
    // Combine all inputs
    std::vector<uint8_t> combined;
    
    // Add frame data
    combined.insert(combined.end(), frameData.begin(), frameData.end());
    
    // Add BPM as bytes
    std::string bpmStr = std::to_string(bpm);
    combined.insert(combined.end(), bpmStr.begin(), bpmStr.end());
    
    // Add hardware ID
    combined.insert(combined.end(), hardwareID.begin(), hardwareID.end());
    
    // Add timestamp
    std::string tsStr = std::to_string(timestamp);
    combined.insert(combined.end(), tsStr.begin(), tsStr.end());
    
    // Generate BLAKE3 hash (using SHA-256 placeholder for now)
    return sha256(combined);
}

std::string CryptoUtils::sha256(const std::vector<uint8_t>& data) {
#ifdef HAVE_OPENSSL
    // Production implementation using OpenSSL
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_CTX sha256;
    SHA256_Init(&sha256);
    SHA256_Update(&sha256, data.data(), data.size());
    SHA256_Final(hash, &sha256);
    
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        ss << std::setw(2) << static_cast<int>(hash[i]);
    }
    return ss.str();
#elif defined(HAVE_LIBSODIUM)
    unsigned char hash[crypto_hash_sha256_BYTES];
    crypto_hash_sha256(hash, data.data(), data.size());

    // Hex encoding via libsodium
    std::vector<char> hex(crypto_hash_sha256_BYTES * 2 + 1);
    sodium_bin2hex(hex.data(), hex.size(), hash, crypto_hash_sha256_BYTES);
    return std::string(hex.data());
#else
    std::cerr << "⚠️  WARNING: SHA-256 falling back to mock implementation (no OpenSSL/libsodium)" << std::endl;
    uint32_t hash = 0;
    for (const auto& byte : data) {
        hash = ((hash << 5) + hash) + byte;
    }
    std::stringstream ss;
    ss << std::hex << std::setw(8) << std::setfill('0') << hash;
    std::string result = ss.str();
    while (result.length() < 64) {
        result += "0";
    }
    return result;
#endif
}

std::string CryptoUtils::blake3(const std::vector<uint8_t>& data) {
#ifdef HAVE_BLAKE3
    // Production implementation using official BLAKE3 library
    uint8_t hash[BLAKE3_OUT_LEN];
    blake3_hasher hasher;
    blake3_hasher_init(&hasher);
    blake3_hasher_update(&hasher, data.data(), data.size());
    blake3_hasher_finalize(&hasher, hash, BLAKE3_OUT_LEN);
    
    // Hex encoding via libsodium if available
#ifdef HAVE_LIBSODIUM
    std::vector<char> hex(BLAKE3_OUT_LEN * 2 + 1);
    sodium_bin2hex(hex.data(), hex.size(), hash, BLAKE3_OUT_LEN);
    return std::string(hex.data());
#else
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (int i = 0; i < BLAKE3_OUT_LEN; i++) {
        ss << std::setw(2) << static_cast<int>(hash[i]);
    }
    return ss.str();
#endif
#else
    // Fallback to SHA-256 if BLAKE3 not available
    static bool warningShown = false;
    if (!warningShown) {
        std::cerr << "⚠️  INFO: BLAKE3 not available, using SHA-256 fallback" << std::endl;
        warningShown = true;
    }
    return sha256(data);
#endif
}

std::string CryptoUtils::bindDeviceToImage(
    const std::string& deviceID,
    const std::vector<uint8_t>& imageData)
{
    // Concatenate Device ID and image data
    // This creates a cryptographic binding between hardware and content
    std::vector<uint8_t> combined;
    combined.reserve(deviceID.size() + imageData.size());
    
    // Add Device ID (PRNU fingerprint) as bytes
    combined.insert(combined.end(), deviceID.begin(), deviceID.end());
    
    // Add image data
    combined.insert(combined.end(), imageData.begin(), imageData.end());
    
    // Generate BLAKE3 hash - this is the \"Hardware DNA\" proof
    // Any attempt to spoof will fail because spoofed images lack original PRNU
    return blake3(combined);
}

std::string CryptoUtils::generateMultiSigHash(
    const std::vector<uint8_t>& frameData,
    int bpm,
    const std::vector<uint8_t>& signature)
{
    // Expect Ed25519 signature length (64 bytes). Proceed even if different, but note in comments.
    std::vector<uint8_t> combined;
    combined.reserve(frameData.size() + sizeof(uint32_t) + signature.size());

    // Frame bytes
    combined.insert(combined.end(), frameData.begin(), frameData.end());

    // BPM as little-endian 32-bit
    uint32_t bpm32 = static_cast<uint32_t>(bpm);
    const uint8_t* bpmBytes = reinterpret_cast<const uint8_t*>(&bpm32);
    combined.insert(combined.end(), bpmBytes, bpmBytes + sizeof(bpm32));

    // Signature bytes
    combined.insert(combined.end(), signature.begin(), signature.end());

    return blake3(combined);
}

std::vector<uint8_t> CryptoUtils::signEd25519(
    const std::vector<uint8_t>& data,
    const std::vector<uint8_t>& privateKey)
{
#ifdef HAVE_LIBSODIUM
    ensureSodiumInit();
    
    // Validate private key size (Ed25519 requires 32 bytes seed or 64 bytes full key)
    if (privateKey.size() != crypto_sign_SECRETKEYBYTES && privateKey.size() != crypto_sign_SEEDBYTES) {
        std::cerr << "ERROR: Invalid Ed25519 private key size: " << privateKey.size() << std::endl;
        return std::vector<uint8_t>();
    }
    
    // Allocate signature buffer
    std::vector<uint8_t> signature(crypto_sign_BYTES);
    
    unsigned char sk[crypto_sign_SECRETKEYBYTES];
    if (privateKey.size() == crypto_sign_SEEDBYTES) {
        // Generate keypair from seed
        unsigned char pk[crypto_sign_PUBLICKEYBYTES];
        crypto_sign_seed_keypair(pk, sk, privateKey.data());
    } else {
        // Use provided secret key
        std::memcpy(sk, privateKey.data(), crypto_sign_SECRETKEYBYTES);
    }
    
    // Sign the data
    unsigned long long siglen;
    if (crypto_sign_detached(signature.data(), &siglen, data.data(), data.size(), sk) != 0) {
        std::cerr << "ERROR: Ed25519 signing failed" << std::endl;
        return std::vector<uint8_t>();
    }
    
    return signature;
#else
    // Fallback mock implementation (INSECURE - for development only)
    static bool warningShown = false;
    if (!warningShown) {
        std::cerr << "⚠️  WARNING: Using mock Ed25519! Install libsodium for production." << std::endl;
        warningShown = true;
    }
    
    if (privateKey.size() != 32 && privateKey.size() != 64) {
        return std::vector<uint8_t>();
    }
    
    // Return mock signature (64 bytes)
    std::vector<uint8_t> signature(64, 0);
    
    // Simple mock: XOR data with private key
    for (size_t i = 0; i < std::min(signature.size(), data.size()); ++i) {
        signature[i] = data[i] ^ privateKey[i % privateKey.size()];
    }
    
    return signature;
#endif
}

bool CryptoUtils::verifyEd25519(
    const std::vector<uint8_t>& data,
    const std::vector<uint8_t>& signature,
    const std::vector<uint8_t>& publicKey)
{
#ifdef HAVE_LIBSODIUM
    ensureSodiumInit();
    
    // Validate sizes
    if (signature.size() != crypto_sign_BYTES) {
        std::cerr << "ERROR: Invalid Ed25519 signature size: " << signature.size() << std::endl;
        return false;
    }
    
    if (publicKey.size() != crypto_sign_PUBLICKEYBYTES) {
        std::cerr << "ERROR: Invalid Ed25519 public key size: " << publicKey.size() << std::endl;
        return false;
    }
    
    // Verify the signature
    int result = crypto_sign_verify_detached(
        signature.data(),
        data.data(),
        data.size(),
        publicKey.data()
    );
    
    return (result == 0);
#else
    // Fallback mock implementation (INSECURE - for development only)
    static bool warningShown = false;
    if (!warningShown) {
        std::cerr << "⚠️  WARNING: Using mock Ed25519 verification! Install libsodium for production." << std::endl;
        warningShown = true;
    }
    
    if (signature.size() != 64 || publicKey.size() != 32) {
        return false;
    }
    
    // Mock verification - always return true for demo
    return true;
#endif
}

std::string CryptoUtils::toHex(const std::vector<uint8_t>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    
    for (const auto& byte : data) {
        ss << std::setw(2) << static_cast<int>(byte);
    }
    
    return ss.str();
}

std::vector<uint8_t> CryptoUtils::fromHex(const std::string& hex) {
    std::vector<uint8_t> result;
    
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        uint8_t byte = static_cast<uint8_t>(std::stoi(byteString, nullptr, 16));
        result.push_back(byte);
    }
    
    return result;
}

uint64_t CryptoUtils::getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto duration = now.time_since_epoch();
    auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(duration).count();
    
    return static_cast<uint64_t>(millis);
}

} // namespace crypto
} // namespace biovault
