#include "BioVaultExtractor.h"

#ifdef HAVE_OPENCV
#include <chrono>
#include <numeric>

BioVaultExtractor::BioVaultExtractor(double windowSeconds, double fpsHint)
    : windowSeconds_(windowSeconds), fpsHint_(fpsHint) {
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

#endif // HAVE_OPENCV
