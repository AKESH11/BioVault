#include "BioVaultExtractor.h"
#include <opencv2/opencv.hpp>
#include <iostream>

int main() {
    cv::VideoCapture cap(0);
    if (!cap.isOpened()) {
        std::cerr << "Cannot open webcam\n";
        return 1;
    }

    BioVaultExtractor extractor(10.0, 30.0);

    while (true) {
        cv::Mat frame;
        if (!cap.read(frame)) break;

        auto result = extractor.processFrame(frame);

#ifdef HAVE_OPENCV
        if (result.faceBox.area() > 0) {
            cv::rectangle(frame, result.faceBox, {0, 255, 0}, 2);
            cv::rectangle(frame, result.foreheadRoi, {0, 200, 255}, 2);
        }

        if (result.bpm.has_value()) {
            std::string text = "BPM: " + std::to_string(static_cast<int>(*result.bpm)) +
                "  conf: " + cv::format("%.2f", result.confidence);
            cv::putText(frame, text, {20, 30}, cv::FONT_HERSHEY_SIMPLEX, 0.8, {0, 255, 0}, 2);
        } else {
            cv::putText(frame, "Collecting...", {20, 30}, cv::FONT_HERSHEY_SIMPLEX, 0.8, {0, 255, 255}, 2);
        }
#endif

        cv::imshow("BioVault rPPG", frame);
        if (cv::waitKey(1) == 27) break; // ESC
    }
    return 0;
}
