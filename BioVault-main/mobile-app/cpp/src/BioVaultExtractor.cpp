#include "BioVaultExtractor.h"

#ifdef HAVE_OPENCV
#include <algorithm>
#include <chrono>
#include <cmath>
#include <numeric>

BioVaultExtractor::BioVaultExtractor(double windowSeconds, double fpsHint)
    : windowSeconds_(windowSeconds), fpsHint_(fpsHint), maxFaces_(5) {
    // Try to load default frontal face cascade from OpenCV data path.
    try {
        const std::string cascadePath = cv::samples::findFile("haarcascade_frontalface_default.xml", false);
        cascadeLoaded_ = faceDetector_.load(cascadePath);
    } catch (...) {
        cascadeLoaded_ = false;
    }
}

std::optional<cv::Rect> BioVaultExtractor::detectFace(const cv::Mat& gray) {
    if (!cascadeLoaded_) return std::nullopt;

    std::vector<cv::Rect> faces;
    faceDetector_.detectMultiScale(gray, faces, 1.1, 3, 0, cv::Size(80, 80));
    if (faces.empty()) return std::nullopt;

    return *std::max_element(faces.begin(), faces.end(),
        [](const cv::Rect& a, const cv::Rect& b) { return a.area() < b.area(); });
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

    if (samples_.size() < static_cast<size_t>(windowSeconds_ * fpsHint_ * 0.6)) {
        return res;
    }

    // Build signal and estimate sampling rate from timestamps for robustness to jitter.
    std::vector<double> signal;
    signal.reserve(samples_.size());
    double t0 = samples_.front().first;
    double t1 = samples_.back().first;
    for (auto& p : samples_) signal.push_back(p.second);

    res.signal = signal;

    if (t1 <= t0) return res;
    double fs = (signal.size() - 1) / (t1 - t0); // effective sampling rate

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

    if (bestFreq > 0.0) {
        res.bpm = bestFreq * 60.0;
        // Confidence: simple normalization of peak magnitude by window size.
        res.confidence = std::min(1.0, bestMag / (1e-6 + 0.5 * N));
    }

    return res;
}

BioVaultExtractor::Result BioVaultExtractor::processFrame(const cv::Mat& bgrFrame) {
    Result res;
    if (bgrFrame.empty() || !cascadeLoaded_) return res;

    cv::Mat gray;
    cv::cvtColor(bgrFrame, gray, cv::COLOR_BGR2GRAY);
    auto faceOpt = detectFace(gray);
    if (!faceOpt) return res;

    cv::Rect face = *faceOpt;
    cv::Rect forehead = foreheadRegion(face);

    double t = std::chrono::duration<double>(
        std::chrono::steady_clock::now().time_since_epoch()).count();

    double gMean = extractGreenMean(bgrFrame, forehead);
    samples_.push_back({t, gMean});

    // Drop samples older than window
    double cutoff = t - windowSeconds_;
    while (!samples_.empty() && samples_.front().first < cutoff) {
        samples_.pop_front();
    }

    res = computeBpmIfReady(face, forehead);
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
