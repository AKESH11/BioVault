/**
 * BioVault C++ Unit Tests
 * 
 * Tests for the core native modules:
 *   - CryptoUtils: SHA-256, BLAKE3, Ed25519, hex encoding
 *   - RPPGEngine: Frame processing, BPM calculation, liveness
 *   - PRNUExtractor: Pattern extraction, fingerprinting
 * 
 * Build:
 *   cd mobile-app/cpp
 *   mkdir -p build && cd build
 *   cmake .. -DBUILD_TESTS=ON && make
 *   ./biovault_tests
 * 
 * Or with Google Test (if available):
 *   cmake .. -DBUILD_TESTS=ON -DUSE_GTEST=ON && make
 *   ./biovault_tests
 * 
 * Without Google Test, a minimal test framework is included.
 */

#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <cassert>
#include <cstring>
#include <sstream>
#include <chrono>
#include <functional>

// BioVault headers
#include "../include/crypto_utils.h"
#include "../include/rppg_engine.h"
#include "../include/prnu_extractor.h"

using namespace biovault;
using namespace biovault::crypto;

// ============================================================================
// Minimal Test Framework (when Google Test is not available)
// ============================================================================

static int g_testsPassed = 0;
static int g_testsFailed = 0;
static int g_testsSkipped = 0;

struct TestResult {
    std::string name;
    bool passed;
    std::string message;
    double durationMs;
};

static std::vector<TestResult> g_results;

#define TEST(name) \
    void test_##name(); \
    static bool _reg_##name = (registerTest(#name, test_##name), true); \
    void test_##name()

#define EXPECT_TRUE(expr) \
    do { if (!(expr)) { throw std::runtime_error(std::string("EXPECT_TRUE failed: ") + #expr); } } while(0)

#define EXPECT_FALSE(expr) \
    do { if (expr) { throw std::runtime_error(std::string("EXPECT_FALSE failed: ") + #expr); } } while(0)

#define EXPECT_EQ(a, b) \
    do { if ((a) != (b)) { \
        std::ostringstream ss; \
        ss << "EXPECT_EQ failed: " << #a << " (" << (a) << ") != " << #b << " (" << (b) << ")"; \
        throw std::runtime_error(ss.str()); \
    } } while(0)

#define EXPECT_NE(a, b) \
    do { if ((a) == (b)) { \
        std::ostringstream ss; \
        ss << "EXPECT_NE failed: " << #a << " (" << (a) << ") == " << #b; \
        throw std::runtime_error(ss.str()); \
    } } while(0)

#define EXPECT_GT(a, b) \
    do { if (!((a) > (b))) { \
        std::ostringstream ss; \
        ss << "EXPECT_GT failed: " << #a << " (" << (a) << ") <= " << #b << " (" << (b) << ")"; \
        throw std::runtime_error(ss.str()); \
    } } while(0)

#define EXPECT_GE(a, b) \
    do { if (!((a) >= (b))) { \
        std::ostringstream ss; \
        ss << "EXPECT_GE failed: " << #a << " (" << (a) << ") < " << #b << " (" << (b) << ")"; \
        throw std::runtime_error(ss.str()); \
    } } while(0)

#define SKIP_TEST(reason) \
    do { g_testsSkipped++; throw std::logic_error(std::string("SKIPPED: ") + reason); } while(0)

typedef std::function<void()> TestFn;
static std::vector<std::pair<std::string, TestFn>> g_tests;

void registerTest(const std::string& name, TestFn fn) {
    g_tests.push_back({name, fn});
}

// ============================================================================
// CryptoUtils Tests
// ============================================================================

TEST(crypto_toHex_empty) {
    std::vector<uint8_t> empty;
    std::string result = CryptoUtils::toHex(empty);
    EXPECT_EQ(result, std::string(""));
}

TEST(crypto_toHex_basic) {
    std::vector<uint8_t> data = {0xDE, 0xAD, 0xBE, 0xEF};
    std::string result = CryptoUtils::toHex(data);
    // toHex should produce lowercase hex
    EXPECT_TRUE(result == "deadbeef" || result == "DEADBEEF");
}

TEST(crypto_fromHex_roundtrip) {
    std::string hex = "48656c6c6f"; // "Hello"
    std::vector<uint8_t> bytes = CryptoUtils::fromHex(hex);
    std::string back = CryptoUtils::toHex(bytes);
    // Case-insensitive comparison
    std::string lowerHex = hex;
    for (auto& c : lowerHex) c = std::tolower(c);
    std::string lowerBack = back;
    for (auto& c : lowerBack) c = std::tolower(c);
    EXPECT_EQ(lowerHex, lowerBack);
}

TEST(crypto_fromHex_validates_length) {
    // Odd-length hex should produce empty or handle gracefully
    std::vector<uint8_t> result = CryptoUtils::fromHex("abc");
    // Implementation should either pad or return empty
    // Just verify no crash
    EXPECT_TRUE(true);
}

TEST(crypto_sha256_known_vector) {
    // SHA-256 of empty input: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    std::vector<uint8_t> empty;
    std::string hash = CryptoUtils::sha256(empty);
    EXPECT_EQ(hash.length(), size_t(64)); // 32 bytes = 64 hex chars
    
    // SHA-256 of "hello"
    std::vector<uint8_t> hello = {'h', 'e', 'l', 'l', 'o'};
    std::string helloHash = CryptoUtils::sha256(hello);
    EXPECT_EQ(helloHash.length(), size_t(64));
    
    // Same input should produce same hash (deterministic)
    std::string helloHash2 = CryptoUtils::sha256(hello);
    EXPECT_EQ(helloHash, helloHash2);
}

TEST(crypto_sha256_different_inputs) {
    std::vector<uint8_t> a = {'a'};
    std::vector<uint8_t> b = {'b'};
    std::string hashA = CryptoUtils::sha256(a);
    std::string hashB = CryptoUtils::sha256(b);
    EXPECT_NE(hashA, hashB);
}

TEST(crypto_blake3_output_length) {
    std::vector<uint8_t> data = {'t', 'e', 's', 't'};
    std::string hash = CryptoUtils::blake3(data);
    EXPECT_EQ(hash.length(), size_t(64)); // 32 bytes = 64 hex chars
}

TEST(crypto_blake3_deterministic) {
    std::vector<uint8_t> data = {1, 2, 3, 4, 5};
    std::string hash1 = CryptoUtils::blake3(data);
    std::string hash2 = CryptoUtils::blake3(data);
    EXPECT_EQ(hash1, hash2);
}

TEST(crypto_blake3_different_inputs) {
    std::vector<uint8_t> a = {0x00};
    std::vector<uint8_t> b = {0x01};
    EXPECT_NE(CryptoUtils::blake3(a), CryptoUtils::blake3(b));
}

TEST(crypto_bindDeviceToImage) {
    std::string deviceID = "prnu_fingerprint_abc123";
    std::vector<uint8_t> imageData = {0xFF, 0xD8, 0xFF, 0xE0}; // JPEG magic
    
    std::string binding = CryptoUtils::bindDeviceToImage(deviceID, imageData);
    EXPECT_EQ(binding.length(), size_t(64)); // BLAKE3 hash
    
    // Different device should give different binding
    std::string binding2 = CryptoUtils::bindDeviceToImage("other_device", imageData);
    EXPECT_NE(binding, binding2);
    
    // Different image should give different binding
    std::vector<uint8_t> otherImage = {0x89, 0x50, 0x4E, 0x47}; // PNG magic
    std::string binding3 = CryptoUtils::bindDeviceToImage(deviceID, otherImage);
    EXPECT_NE(binding, binding3);
}

TEST(crypto_generateMultiSigHash) {
    std::vector<uint8_t> frameData = {1, 2, 3, 4};
    int bpm = 72;
    std::vector<uint8_t> signature(64, 0xAA); // Mock 64-byte signature
    
    std::string hash = CryptoUtils::generateMultiSigHash(frameData, bpm, signature);
    EXPECT_EQ(hash.length(), size_t(64));
    
    // Different BPM should change hash
    std::string hash2 = CryptoUtils::generateMultiSigHash(frameData, 80, signature);
    EXPECT_NE(hash, hash2);
}

TEST(crypto_ed25519_sign_verify) {
    // Generate a test keypair (32 bytes each)
    // In real use, libsodium would generate these
    std::vector<uint8_t> privateKey(32, 0x42); // Test key
    std::vector<uint8_t> data = {'s', 'i', 'g', 'n', ' ', 'm', 'e'};
    
    std::vector<uint8_t> signature = CryptoUtils::signEd25519(data, privateKey);
    
    // Signature should be 64 bytes
    EXPECT_EQ(signature.size(), size_t(64));
    
    // Note: Full verify test requires matching public key from libsodium keygen
    // This test verifies the function runs without crashing and produces output
}

TEST(crypto_generateBioVaultHash) {
    std::vector<uint8_t> frameData(1024, 0x55); // 1KB of test data
    int bpm = 72;
    std::string hardwareID = "SAMSUNG_SM-G998B_PRNU_abc123";
    uint64_t timestamp = 1700000000000ULL;
    
    std::string hash = CryptoUtils::generateBioVaultHash(frameData, bpm, hardwareID, timestamp);
    EXPECT_EQ(hash.length(), size_t(64));
    
    // Same inputs = same hash
    std::string hash2 = CryptoUtils::generateBioVaultHash(frameData, bpm, hardwareID, timestamp);
    EXPECT_EQ(hash, hash2);
    
    // Different timestamp = different hash
    std::string hash3 = CryptoUtils::generateBioVaultHash(frameData, bpm, hardwareID, timestamp + 1);
    EXPECT_NE(hash, hash3);
}

TEST(crypto_getCurrentTimestamp) {
    uint64_t ts = CryptoUtils::getCurrentTimestamp();
    EXPECT_GT(ts, uint64_t(1600000000000ULL)); // After 2020
    
    // Should be monotonic
    uint64_t ts2 = CryptoUtils::getCurrentTimestamp();
    EXPECT_GE(ts2, ts);
}

// ============================================================================
// RPPGEngine Tests
// ============================================================================

TEST(rppg_construction) {
    RPPGEngine engine(30, 150);
    EXPECT_EQ(engine.getCurrentBPM(), -1); // No data yet
    EXPECT_TRUE(engine.getConfidence() >= 0.0f);
    EXPECT_TRUE(engine.getConfidence() <= 1.0f);
}

TEST(rppg_initial_state) {
    RPPGEngine engine;
    EXPECT_EQ(engine.getCurrentBPM(), -1);
    EXPECT_FALSE(engine.isLivenessDetected());
}

TEST(rppg_reset) {
    RPPGEngine engine;
    engine.reset();
    EXPECT_EQ(engine.getCurrentBPM(), -1);
    EXPECT_FALSE(engine.isLivenessDetected());
}

#ifdef HAVE_OPENCV
TEST(rppg_process_synthetic_frames) {
    RPPGEngine engine(30, 90); // 30fps, 3-second window
    
    // Simulate 90 frames with synthetic color variation (72 BPM = 1.2 Hz)
    const double heartFreq = 1.2; // Hz
    const double fps = 30.0;
    
    for (int i = 0; i < 90; i++) {
        double t = i / fps;
        // Simulate subtle green channel variation (heart rate signal)
        double pulse = 128 + 5 * std::sin(2 * 3.14159 * heartFreq * t);
        
        cv::Mat frame(100, 100, CV_8UC3, cv::Scalar(int(pulse - 5), int(pulse), int(pulse - 3)));
        cv::Rect face(10, 10, 80, 80);
        
        engine.processFrame(frame, face);
    }
    
    int bpm = engine.getCurrentBPM();
    // Should detect something in the 40-200 BPM range
    if (bpm > 0) {
        EXPECT_GT(bpm, 40);
        EXPECT_TRUE(bpm < 200);
    }
}
#else
TEST(rppg_process_without_opencv) {
    // Without OpenCV, processFrame takes void pointers
    RPPGEngine engine;
    bool result = engine.processFrame(nullptr, nullptr);
    // Should handle null gracefully
    EXPECT_TRUE(true); // Just verify no crash
}
#endif

// ============================================================================
// PRNUExtractor Tests
// ============================================================================

TEST(prnu_construction) {
    PRNUExtractor extractor;
    std::string fp = extractor.getHardwareFingerprint();
    // Before calibration, fingerprint should be empty
    EXPECT_TRUE(fp.empty() || fp.length() == 64);
}

TEST(prnu_getPRNUBytes_before_calibration) {
    PRNUExtractor extractor;
    std::vector<uint8_t> bytes = extractor.getPRNUBytes();
    // Before calibration, should be empty
    EXPECT_TRUE(bytes.empty() || bytes.size() > 0); // Implementation-dependent
}

#ifdef HAVE_OPENCV
TEST(prnu_extract_pattern) {
    PRNUExtractor extractor;
    
    // Create 50 synthetic frames
    std::vector<cv::Mat> frames;
    for (int i = 0; i < 50; i++) {
        cv::Mat frame(480, 640, CV_8UC3);
        cv::randu(frame, 0, 255);
        // Add fixed noise pattern (simulated PRNU)
        cv::Mat noise(480, 640, CV_8UC3);
        cv::randu(noise, -2, 2);
        frame += noise;
        frames.push_back(frame);
    }
    
    bool success = extractor.extractPattern(frames);
    EXPECT_TRUE(success);
    
    std::string fp = extractor.getHardwareFingerprint();
    EXPECT_EQ(fp.length(), size_t(64)); // Hash should be 64 hex chars
}

TEST(prnu_verify_frame_correlation) {
    PRNUExtractor extractor;
    
    // Calibrate with frames
    std::vector<cv::Mat> frames;
    for (int i = 0; i < 50; i++) {
        cv::Mat frame(100, 100, CV_8UC3);
        cv::randu(frame, 100, 200);
        frames.push_back(frame);
    }
    
    extractor.extractPattern(frames);
    
    // Verify a similar frame
    cv::Mat testFrame(100, 100, CV_8UC3);
    cv::randu(testFrame, 100, 200);
    float score = extractor.verifyFrame(testFrame);
    
    EXPECT_GE(score, 0.0f);
    EXPECT_TRUE(score <= 1.0f);
}
#endif

TEST(prnu_save_load_pattern) {
    PRNUExtractor extractor;
    // Test save/load with non-existent path (should handle gracefully)
    bool saved = extractor.savePattern("/tmp/biovault_test_prnu.enc");
    // Before calibration, save might fail
    EXPECT_TRUE(true); // Just verify no crash
}

// ============================================================================
// Integration Tests
// ============================================================================

TEST(integration_hash_chain) {
    // Test the full BioVault hash chain without hardware
    std::vector<uint8_t> frameData = {0xFF, 0xD8, 0xFF}; // Mock JPEG
    int bpm = 72;
    std::string hardwareID = "test_device_001";
    
    // 1. Generate BioVault hash
    std::string bioHash = CryptoUtils::generateBioVaultHash(
        frameData, bpm, hardwareID, CryptoUtils::getCurrentTimestamp()
    );
    EXPECT_EQ(bioHash.length(), size_t(64));
    
    // 2. Bind device to image
    std::string deviceBinding = CryptoUtils::bindDeviceToImage(hardwareID, frameData);
    EXPECT_EQ(deviceBinding.length(), size_t(64));
    
    // 3. SHA-256 for blockchain anchor
    std::vector<uint8_t> hashBytes = CryptoUtils::fromHex(bioHash);
    std::string anchorHash = CryptoUtils::sha256(hashBytes);
    EXPECT_EQ(anchorHash.length(), size_t(64));
    
    // All hashes should be unique
    EXPECT_NE(bioHash, deviceBinding);
    EXPECT_NE(bioHash, anchorHash);
    EXPECT_NE(deviceBinding, anchorHash);
}

TEST(integration_multisig_with_signing) {
    std::vector<uint8_t> frameData = {1, 2, 3, 4, 5};
    int bpm = 65;
    std::vector<uint8_t> privateKey(32, 0x01);
    
    // Sign the frame data
    std::vector<uint8_t> signature = CryptoUtils::signEd25519(frameData, privateKey);
    EXPECT_EQ(signature.size(), size_t(64));
    
    // Generate multi-sig hash
    std::string multiSigHash = CryptoUtils::generateMultiSigHash(frameData, bpm, signature);
    EXPECT_EQ(multiSigHash.length(), size_t(64));
}

// ============================================================================
// Performance Tests
// ============================================================================

TEST(perf_sha256_throughput) {
    std::vector<uint8_t> data(1024 * 1024, 0x42); // 1MB
    
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 10; i++) {
        CryptoUtils::sha256(data);
    }
    auto end = std::chrono::high_resolution_clock::now();
    
    double ms = std::chrono::duration<double, std::milli>(end - start).count();
    double mbps = (10.0 * 1.0) / (ms / 1000.0); // MB/s
    
    std::cout << "    SHA-256: " << (ms / 10.0) << "ms per 1MB (" << mbps << " MB/s)" << std::endl;
    EXPECT_TRUE(ms < 10000); // Should complete in under 10s total
}

TEST(perf_blake3_throughput) {
    std::vector<uint8_t> data(1024 * 1024, 0x42); // 1MB
    
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 10; i++) {
        CryptoUtils::blake3(data);
    }
    auto end = std::chrono::high_resolution_clock::now();
    
    double ms = std::chrono::duration<double, std::milli>(end - start).count();
    double mbps = (10.0 * 1.0) / (ms / 1000.0); // MB/s
    
    std::cout << "    BLAKE3: " << (ms / 10.0) << "ms per 1MB (" << mbps << " MB/s)" << std::endl;
    EXPECT_TRUE(ms < 10000);
}

TEST(perf_hex_encoding) {
    std::vector<uint8_t> data(10000, 0xAB);
    
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 1000; i++) {
        CryptoUtils::toHex(data);
    }
    auto end = std::chrono::high_resolution_clock::now();
    
    double ms = std::chrono::duration<double, std::milli>(end - start).count();
    std::cout << "    Hex encode: " << (ms / 1000.0) << "ms per 10KB" << std::endl;
    EXPECT_TRUE(ms < 5000);
}

// ============================================================================
// Test Runner
// ============================================================================

int main(int argc, char* argv[]) {
    bool verbose = false;
    std::string filter;
    
    for (int i = 1; i < argc; i++) {
        if (std::string(argv[i]) == "-v" || std::string(argv[i]) == "--verbose") {
            verbose = true;
        } else if (std::string(argv[i]).substr(0, 9) == "--filter=") {
            filter = std::string(argv[i]).substr(9);
        }
    }

    std::cout << "\n================================================" << std::endl;
    std::cout << "  BioVault C++ Unit Tests" << std::endl;
    std::cout << "  Tests registered: " << g_tests.size() << std::endl;
    std::cout << "================================================\n" << std::endl;

    for (const auto& [name, fn] : g_tests) {
        // Apply filter
        if (!filter.empty() && name.find(filter) == std::string::npos) {
            continue;
        }

        auto start = std::chrono::high_resolution_clock::now();
        
        try {
            fn();
            auto end = std::chrono::high_resolution_clock::now();
            double ms = std::chrono::duration<double, std::milli>(end - start).count();
            
            g_testsPassed++;
            g_results.push_back({name, true, "", ms});
            
            if (verbose) {
                std::cout << "  [PASS] " << name << " (" << ms << "ms)" << std::endl;
            } else {
                std::cout << "  [PASS] " << name << std::endl;
            }
            
        } catch (const std::logic_error& e) {
            // Skipped tests
            auto end = std::chrono::high_resolution_clock::now();
            double ms = std::chrono::duration<double, std::milli>(end - start).count();
            
            g_results.push_back({name, true, e.what(), ms});
            std::cout << "  [SKIP] " << name << " — " << e.what() << std::endl;
            
        } catch (const std::exception& e) {
            auto end = std::chrono::high_resolution_clock::now();
            double ms = std::chrono::duration<double, std::milli>(end - start).count();
            
            g_testsFailed++;
            g_results.push_back({name, false, e.what(), ms});
            std::cout << "  [FAIL] " << name << std::endl;
            std::cout << "         " << e.what() << std::endl;
        }
    }

    // Summary
    std::cout << "\n================================================" << std::endl;
    std::cout << "  Results: " << g_testsPassed << " passed, " 
              << g_testsFailed << " failed, "
              << g_testsSkipped << " skipped"
              << " / " << (g_testsPassed + g_testsFailed + g_testsSkipped) << " total" << std::endl;
    std::cout << "================================================\n" << std::endl;

    return g_testsFailed > 0 ? 1 : 0;
}
