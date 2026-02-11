#include "BioVaultExtractor.h"

#ifdef HAVE_OPENCV
#include <algorithm>
#include <chrono>
#include <cmath>
#include <numeric>

#ifdef ANDROID
#include <android/log.h>
#define LOG_TAG "BioVault::rPPG"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#else
#define LOGD(...) 
#define LOGI(...)
#endif

BioVaultExtractor::BioVaultExtractor(double windowSeconds, double fpsHint)
    : windowSeconds_(windowSeconds), fpsHint_(fpsHint), maxFaces_(5) {
    // Try to load default frontal face cascade from OpenCV data path
    #ifdef ANDROID
    // On Android, try multiple possible locations for the cascade file
    std::vector<std::string> possiblePaths = {
        "/data/local/tmp/haarcascade_frontalface_default.xml",
        "./haarcascade_frontalface_default.xml",
    };
    
    cascadeLoaded_ = false;
    for (const auto& path : possiblePaths) {
        if (faceDetector_.load(path)) {
            cascadeLoaded_ = true;
            break;
        }
    }
    
    // If cascade file not found, use LBP (Locally Binary Patterns) cascade as fallback
    // LBP cascades are usually embedded in OpenCV libs
    if (!cascadeLoaded_) {
        // For now, set flag to use alternative face detection
        // We'll use simple skin-color + motion detection as backup
        cascadeLoaded_ = false;
    }
    #else
    try {
        const std::string cascadePath = cv::samples::findFile("haarcascade_frontalface_default.xml", false);
        cascadeLoaded_ = faceDetector_.load(cascadePath);
    } catch (...) {
        cascadeLoaded_ = false;
    }
    #endif
}

std::optional<cv::Rect> BioVaultExtractor::detectFace(const cv::Mat& gray) {
    if (cascadeLoaded_) {
        // Use Haar Cascade if available
        std::vector<cv::Rect> faces;
        faceDetector_.detectMultiScale(gray, faces, 1.1, 3, 0, cv::Size(80, 80));
        if (!faces.empty()) {
            return *std::max_element(faces.begin(), faces.end(),
                [](const cv::Rect& a, const cv::Rect& b) { return a.area() < b.area(); });
        }
        return std::nullopt;
    }
    
    // Fallback: Use strict skin color detection in center region
    int centerWidth = static_cast<int>(gray.cols * 0.5);
    int centerHeight = static_cast<int>(gray.rows * 0.5);
    int x = (gray.cols - centerWidth) / 2;
    int y = (gray.rows - centerHeight) / 2;
    cv::Rect centerRect(x, y, centerWidth, centerHeight);
    
    // Check if center region has reasonable brightness
    cv::Rect safeRect = centerRect & cv::Rect(0, 0, gray.cols, gray.rows);
    if (safeRect.empty()) return std::nullopt;
    
    cv::Scalar mean = cv::mean(gray(safeRect));
    double brightness = mean[0];
    
    // Stricter brightness range for faces (80-180)
    if (brightness < 80.0 || brightness > 180.0) {
        LOGD("Face check failed: brightness=%.1f (need 80-180)", brightness);
        return std::nullopt;
    }
    
    // Check variance - faces have significant texture
    cv::Scalar meanColor, stddev;
    cv::meanStdDev(gray(safeRect), meanColor, stddev);
    if (stddev[0] < 20.0) {
        LOGD("Face check failed: stddev=%.1f (need >20 for texture)", stddev[0]);
        return std::nullopt; // Too uniform - no face details
    }
    
    // Check edge density - faces have many edges (eyes, nose, mouth)
    cv::Mat edges;
    cv::Canny(gray(safeRect), edges, 50, 150);
    int edgeCount = cv::countNonZero(edges);
    double edgeDensity = static_cast<double>(edgeCount) / (safeRect.area());
    
    if (edgeDensity < 0.05) {
        LOGD("Face check failed: edgeDensity=%.3f (need >0.05)", edgeDensity);
        return std::nullopt; // Not enough facial features
    }
    
    LOGD("Face detected: brightness=%.1f, stddev=%.1f, edges=%.3f", brightness, stddev[0], edgeDensity);
    return centerRect;
}

cv::Rect BioVaultExtractor::foreheadRegion(const cv::Rect& face) const {
    // Forehead: top 20% of face height, centered 60% width.
    int fh = static_cast<int>(face.height * 0.20);
    int fw = static_cast<int>(face.width * 0.60);
    int x = face.x + (face.width - fw) / 2;
    int y = face.y + static_cast<int>(face.height * 0.10);
    return cv::Rect(x, y, fw, fh);
}

double BioVaultExtractor::extractGreenMean(const cv::Mat& bgr, const cv::Rect& roi) const {
    cv::Rect safe = roi & cv::Rect(0, 0, bgr.cols, bgr.rows);
    if (safe.empty()) return 0.0;
    cv::Scalar mean = cv::mean(bgr(safe));
    return mean[1]; // green channel
}

BioVaultExtractor::Result BioVaultExtractor::computeBpmIfReady(
    const cv::Rect& faceBox, const cv::Rect& foreheadBox) {

    Result res;
    res.faceBox = faceBox;
    res.foreheadRoi = foreheadBox;
    res.confidence = 0.0;

    const size_t minNeeded = static_cast<size_t>(windowSeconds_ * fpsHint_ * 0.6);
    LOGD("computeBpmIfReady: samples=%zu, minNeeded=%zu", samples_.size(), minNeeded);
    
    if (samples_.size() < minNeeded) {
        LOGD("Not enough samples yet - need %zu more", minNeeded - samples_.size());
        return res;
    }

    // Build signal and estimate sampling rate from timestamps for robustness to jitter.
    std::vector<double> signal;
    signal.reserve(samples_.size());
    double t0 = samples_.front().first;
    double t1 = samples_.back().first;
    for (auto& p : samples_) signal.push_back(p.second);

    res.signal = signal;

    if (t1 <= t0) {
        LOGD("Invalid timestamps: t0=%.2f, t1=%.2f", t0, t1);
        return res;
    }
    double fs = (signal.size() - 1) / (t1 - t0); // effective sampling rate
    LOGD("Signal ready: N=%d, duration=%.2fs, fs=%.2f Hz", (int)signal.size(), t1-t0, fs);

    // Detrend
    double mean = std::accumulate(signal.begin(), signal.end(), 0.0) / signal.size();
    for (auto& v : signal) v -= mean;

    // Hamming window to reduce spectral leakage
    const int N = static_cast<int>(signal.size());
    std::vector<double> windowed(N);
    for (int n = 0; n < N; ++n) {
        double w = 0.54 - 0.46 * std::cos(2.0 * CV_PI * n / (N - 1));
        windowed[n] = signal[n] * w;
    }

    cv::Mat dftIn(1, N, CV_64F);
    for (int i = 0; i < N; ++i) dftIn.at<double>(0, i) = windowed[i];

    cv::Mat dftOut;
    cv::dft(dftIn, dftOut, cv::DFT_COMPLEX_OUTPUT);

    double minHz = 0.8;  // 48 BPM
    double maxHz = 3.0;  // 180 BPM

    int minBin = static_cast<int>(std::ceil(minHz * N / fs));
    int maxBin = static_cast<int>(std::floor(maxHz * N / fs));
    minBin = std::max(minBin, 1);
    maxBin = std::min(maxBin, N / 2 - 1);

    double bestMag = 0.0;
    double bestFreq = 0.0;

    for (int k = minBin; k <= maxBin; ++k) {
        cv::Vec2d c = dftOut.at<cv::Vec2d>(0, k);
        double mag = std::hypot(c[0], c[1]);
        if (mag > bestMag) {
            bestMag = mag;
            bestFreq = k * fs / N;
        }
    }

    LOGD("FFT analysis: bestFreq=%.3f Hz, bestMag=%.2f", bestFreq, bestMag);
    
    if (bestFreq > 0.0) {
        double rawBPM = bestFreq * 60.0;
        
        // Reject physiologically impossible values - stricter range
        if (rawBPM < 50.0 || rawBPM > 160.0) {
            LOGD("✗ BPM rejected: %.1f out of range (50-160)", rawBPM);
            return res;
        }
        
        // Boost readings in normal range (60-100 BPM)
        // This helps favor normal heart rates over artifacts
        if (rawBPM >= 60.0 && rawBPM <= 100.0) {
            // In normal range - trust it more
            LOGD("✓ BPM in normal range: %.1f", rawBPM);
        } else if (rawBPM < 60.0) {
            // Below normal - might be artifact, check if there's a harmonic
            double harmonicBPM = rawBPM * 2.0;  // Check 2x frequency
            if (harmonicBPM >= 60.0 && harmonicBPM <= 100.0) {
                LOGD("✓ Using harmonic: %.1f -> %.1f (2x)", rawBPM, harmonicBPM);
                rawBPM = harmonicBPM;
            }
        }
        
        // Add to smoothing buffer
        recentBPMs_.push_back(rawBPM);
        if (recentBPMs_.size() > 5) recentBPMs_.pop_front();
        
        // Calculate median for outlier rejection
        std::vector<double> sortedBPMs(recentBPMs_.begin(), recentBPMs_.end());
        std::sort(sortedBPMs.begin(), sortedBPMs.end());
        double medianBPM = sortedBPMs[sortedBPMs.size() / 2];
        
        // More aggressive outlier rejection for sub-60 readings
        double tolerance = (rawBPM < 60.0) ? 15.0 : 25.0;
        if (recentBPMs_.size() >= 3 && std::abs(rawBPM - medianBPM) > tolerance) {
            LOGD("✗ BPM rejected: %.1f too far from median %.1f (tolerance=%.1f)", rawBPM, medianBPM, tolerance);
            res.bpm = lastValidBPM_ > 0 ? lastValidBPM_ : medianBPM;
            res.confidence = 0.3; // Low confidence for filtered value
        } else {
            // Use median for stability
            res.bpm = medianBPM;
            lastValidBPM_ = medianBPM;
            // Improved confidence based on signal quality
            double baseConfidence = std::min(1.0, bestMag / (1e-6 + 0.5 * N));
            // Boost confidence if in normal range
            double rangeBonus = (medianBPM >= 60.0 && medianBPM <= 100.0) ? 1.1 : 1.0;
            // Boost confidence if readings are stable
            double stability = recentBPMs_.size() >= 3 ? (1.0 - std::min(1.0, std::abs(rawBPM - medianBPM) / 10.0)) : 0.5;
            res.confidence = std::min(1.0, baseConfidence * stability * rangeBonus);
        }
        
        LOGI("✓ BPM: raw=%.1f, smoothed=%.1f (confidence=%.2f)", rawBPM, res.bpm.value(), res.confidence);
    } else {
        LOGD("✗ No valid BPM peak found");
    }

    return res;
}

BioVaultExtractor::Result BioVaultExtractor::processFrame(const cv::Mat& bgrFrame) {
    Result res;
    if (bgrFrame.empty()) return res; // Only check if frame is empty, not cascade status

    cv::Mat gray;
    cv::cvtColor(bgrFrame, gray, cv::COLOR_BGR2GRAY);
    auto faceOpt = detectFace(gray); // Will use fallback if cascade not loaded
    if (!faceOpt) {
        LOGD("No face detected in frame");
        return res;
    }

    cv::Rect face = *faceOpt;
    cv::Rect forehead = foreheadRegion(face);

    double t = std::chrono::duration<double>(
        std::chrono::steady_clock::now().time_since_epoch()).count();

    double gMean = extractGreenMean(bgrFrame, forehead);
    samples_.push_back({t, gMean});
    
    LOGD("Face detected: forehead green=%.2f, samples=%zu", gMean, samples_.size());

    // Drop samples older than window
    double cutoff = t - windowSeconds_;
    while (!samples_.empty() && samples_.front().first < cutoff) {
        samples_.pop_front();
    }

    res = computeBpmIfReady(face, forehead);
    res.faceId = 0; // Mark that we detected a face
    return res;
}

BioVaultExtractor::PersonBioData BioVaultExtractor::computeFromSnapshot(
    int faceId, const cv::Rect& faceBox, const cv::Rect& foreheadBox,
    const RollingBuffer::Snapshot& snap) const {

    PersonBioData res;
    res.faceId = faceId;
    res.faceBox = faceBox;
    res.foreheadRoi = foreheadBox;
    res.confidence = 0.0;

    if (snap.values.empty()) return res;
    res.signal = snap.values;

    const size_t minNeeded = static_cast<size_t>(windowSeconds_ * fpsHint_ * 0.6);
    if (snap.values.size() < minNeeded) return res;
    if (snap.t1 <= snap.t0) return res;

    double fs = (snap.values.size() - 1) / (snap.t1 - snap.t0);

    std::vector<double> signal = snap.values;
    double mean = std::accumulate(signal.begin(), signal.end(), 0.0) / signal.size();
    for (auto& v : signal) v -= mean;

    const int N = static_cast<int>(signal.size());
    std::vector<double> windowed(N);
    for (int n = 0; n < N; ++n) {
        double w = 0.54 - 0.46 * std::cos(2.0 * CV_PI * n / (N - 1));
        windowed[n] = signal[n] * w;
    }

    cv::Mat dftIn(1, N, CV_64F);
    for (int i = 0; i < N; ++i) dftIn.at<double>(0, i) = windowed[i];

    cv::Mat dftOut;
    cv::dft(dftIn, dftOut, cv::DFT_COMPLEX_OUTPUT);

    double minHz = 0.8;  // 48 BPM
    double maxHz = 3.0;  // 180 BPM

    int minBin = static_cast<int>(std::ceil(minHz * N / fs));
    int maxBin = static_cast<int>(std::floor(maxHz * N / fs));
    minBin = std::max(minBin, 1);
    maxBin = std::min(maxBin, N / 2 - 1);

    double bestMag = 0.0;
    double bestFreq = 0.0;

    for (int k = minBin; k <= maxBin; ++k) {
        cv::Vec2d c = dftOut.at<cv::Vec2d>(0, k);
        double mag = std::hypot(c[0], c[1]);
        if (mag > bestMag) {
            bestMag = mag;
            bestFreq = k * fs / N;
        }
    }

    if (bestFreq > 0.0) {
        res.bpm = bestFreq * 60.0;
        res.confidence = std::min(1.0, bestMag / (1e-6 + 0.5 * N));
    }

    return res;
}

void BioVaultExtractor::trimStaleTracks(double nowSeconds) {
    for (auto it = buffers_.begin(); it != buffers_.end();) {
        it->second.trim(windowSeconds_, nowSeconds);
        if (nowSeconds - it->second.lastTimestamp > windowSeconds_) {
            it = buffers_.erase(it);
        } else {
            ++it;
        }
    }

    while (buffers_.size() > static_cast<size_t>(maxFaces_)) {
        auto oldest = std::min_element(buffers_.begin(), buffers_.end(),
            [](const auto& a, const auto& b) { return a.second.lastTimestamp < b.second.lastTimestamp; });
        if (oldest != buffers_.end()) {
            buffers_.erase(oldest);
        } else {
            break;
        }
    }
}

std::vector<BioVaultExtractor::PersonBioData> BioVaultExtractor::processFrameMulti(
    const cv::Mat& bgrFrame, const std::vector<FaceObservation>& faces) {

    std::vector<PersonBioData> outputs;
    if (bgrFrame.empty()) return outputs;

    const double now = std::chrono::duration<double>(
        std::chrono::steady_clock::now().time_since_epoch()).count();

    trimStaleTracks(now);

    const size_t count = std::min(faces.size(), static_cast<size_t>(maxFaces_));
    std::vector<std::future<PersonBioData>> futures;
    futures.reserve(count);

    for (size_t i = 0; i < count; ++i) {
        const auto& obs = faces[i];
        cv::Rect forehead = foreheadRegion(obs.faceBox);
        double gMean = extractGreenMean(bgrFrame, forehead);

        RollingBuffer& buf = buffers_[obs.faceId];
        buf.push(now, gMean, windowSeconds_);

        auto snap = buf.snapshot();

        futures.push_back(std::async(std::launch::async, [this, obs, forehead, snap]() {
            return computeFromSnapshot(obs.faceId, obs.faceBox, forehead, snap);
        }));
    }

    for (auto& fut : futures) {
        outputs.push_back(fut.get());
    }

    return outputs;
}

double BioVaultExtractor::calculatePearsonCorrelation(
    const std::vector<double>& signal1,
    const std::vector<double>& signal2) {
    
    if (signal1.size() != signal2.size() || signal1.empty()) {
        return 0.0;
    }

    const size_t n = signal1.size();
    
    // Calculate means
    double mean1 = std::accumulate(signal1.begin(), signal1.end(), 0.0) / n;
    double mean2 = std::accumulate(signal2.begin(), signal2.end(), 0.0) / n;
    
    // Calculate covariance and standard deviations
    double covariance = 0.0;
    double variance1 = 0.0;
    double variance2 = 0.0;
    
    for (size_t i = 0; i < n; ++i) {
        double diff1 = signal1[i] - mean1;
        double diff2 = signal2[i] - mean2;
        covariance += diff1 * diff2;
        variance1 += diff1 * diff1;
        variance2 += diff2 * diff2;
    }
    
    // Calculate Pearson correlation coefficient
    double denominator = std::sqrt(variance1 * variance2);
    if (denominator < 1e-10) {
        return 0.0;  // Avoid division by zero
    }
    
    return covariance / denominator;
}

std::vector<BioVaultExtractor::PulseCorrelation> BioVaultExtractor::analyzePulseCorrelations(
    const std::vector<PersonBioData>& pulseData,
    double replayThreshold) {
    
    std::vector<PulseCorrelation> results;
    
    // Calculate pairwise correlations
    for (size_t i = 0; i < pulseData.size(); ++i) {
        for (size_t j = i + 1; j < pulseData.size(); ++j) {
            const auto& pulse1 = pulseData[i];
            const auto& pulse2 = pulseData[j];
            
            // Need valid signals for correlation
            if (pulse1.signal.empty() || pulse2.signal.empty()) {
                continue;
            }
            
            // Align signals to same length (take shorter length)
            size_t minLen = std::min(pulse1.signal.size(), pulse2.signal.size());
            std::vector<double> sig1(pulse1.signal.begin(), pulse1.signal.begin() + minLen);
            std::vector<double> sig2(pulse2.signal.begin(), pulse2.signal.begin() + minLen);
            
            // Calculate correlation
            double corr = calculatePearsonCorrelation(sig1, sig2);
            
            PulseCorrelation pc;
            pc.faceId1 = pulse1.faceId;
            pc.faceId2 = pulse2.faceId;
            pc.correlation = corr;
            pc.replayAttack = (std::abs(corr) > replayThreshold);
            
            results.push_back(pc);
        }
    }
    
    return results;
}

#endif // HAVE_OPENCV
