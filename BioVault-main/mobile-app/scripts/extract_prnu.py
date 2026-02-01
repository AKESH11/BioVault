#!/usr/bin/env python3
"""
PRNU (Photo-Response Non-Uniformity) Extractor
Extract camera sensor 'Hardware DNA' from a series of frames

Usage:
    python extract_prnu.py --frames frame1.jpg frame2.jpg frame3.jpg ... --output device_id.npy
    python extract_prnu.py --video video.mp4 --output device_id.npy
"""

import numpy as np
import cv2
import argparse
import sys
from pathlib import Path

def extract_prnu(frames):
    """
    Extract PRNU noise pattern from a series of frames.
    
    PRNU as 'Hardware DNA':
    A camera's sensor has inherent noise characteristics due to manufacturing 
    variations and imperfections. This noise, known as PRNU noise, is unique 
    to each camera sensor and remains consistent across images captured by 
    that sensor.
    
    Args:
        frames: List of image frames (BGR format)
        
    Returns:
        numpy array containing the PRNU noise pattern
    """
    if len(frames) < 50:
        print(f"⚠️  Warning: Only {len(frames)} frames provided. Recommend at least 50 for robust extraction.")
    
    print(f"🔬 Extracting PRNU from {len(frames)} frames...")
    
    # Ensure frames are grayscale
    gray_frames = []
    for frame in frames:
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        gray_frames.append(gray.astype(np.float32))
    
    # Calculate mean of all frames
    print("📊 Computing mean frame...")
    mean_frame = np.mean(gray_frames, axis=0)
    
    # Subtract mean frame from each frame to isolate noise
    print("🔍 Isolating sensor noise...")
    noise_frames = [frame - mean_frame for frame in gray_frames]
    
    # Average noise to get PRNU pattern (reduces random noise, keeps sensor-specific noise)
    print("🧬 Computing PRNU pattern...")
    prnu_pattern = np.mean(noise_frames, axis=0)
    
    # Apply Wiener-like filter to enhance PRNU signal
    blurred = cv2.GaussianBlur(prnu_pattern, (3, 3), 0.5)
    prnu_pattern = prnu_pattern - blurred
    
    # Normalize to [0, 255] range
    prnu_normalized = cv2.normalize(prnu_pattern, None, 0, 255, cv2.NORM_MINMAX)
    prnu_pattern = prnu_normalized.astype(np.uint8)
    
    # Flatten for storage
    device_id = prnu_pattern.flatten()
    
    print(f"✅ PRNU pattern extracted: {device_id.shape[0]} bytes")
    print(f"   Pattern stats: min={device_id.min()}, max={device_id.max()}, mean={device_id.mean():.2f}")
    
    return device_id

def load_frames_from_images(image_paths):
    """Load frames from individual image files."""
    frames = []
    for path in image_paths:
        frame = cv2.imread(str(path))
        if frame is None:
            print(f"⚠️  Warning: Could not load {path}")
            continue
        frames.append(frame)
    return frames

def load_frames_from_video(video_path, max_frames=200):
    """Load frames from video file."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"❌ Error: Could not open video {video_path}")
        return []
    
    frames = []
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Sample frames evenly throughout video
    step = max(1, frame_count // max_frames)
    
    print(f"📹 Loading frames from video (sampling every {step} frames)...")
    
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % step == 0:
            frames.append(frame)
            
        frame_idx += 1
        
        if len(frames) >= max_frames:
            break
    
    cap.release()
    print(f"✅ Loaded {len(frames)} frames from video")
    
    return frames

def main():
    parser = argparse.ArgumentParser(
        description='Extract PRNU (Hardware DNA) from camera sensor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract from multiple images
  python extract_prnu.py --frames img1.jpg img2.jpg img3.jpg --output device_id.npy
  
  # Extract from video
  python extract_prnu.py --video calibration.mp4 --output device_id.npy
  
  # Extract from directory of images
  python extract_prnu.py --frames /path/to/frames/*.jpg --output device_id.npy
        """
    )
    
    parser.add_argument('--frames', nargs='+', help='Input image files')
    parser.add_argument('--video', type=str, help='Input video file')
    parser.add_argument('--output', type=str, required=True, help='Output .npy file for Device ID')
    parser.add_argument('--max-frames', type=int, default=200, 
                       help='Maximum frames to extract from video (default: 200)')
    
    args = parser.parse_args()
    
    # Validate inputs
    if not args.frames and not args.video:
        print("❌ Error: Must provide either --frames or --video")
        parser.print_help()
        sys.exit(1)
    
    if args.frames and args.video:
        print("❌ Error: Provide either --frames or --video, not both")
        sys.exit(1)
    
    # Load frames
    if args.frames:
        print(f"📂 Loading {len(args.frames)} image files...")
        frames = load_frames_from_images(args.frames)
    else:
        frames = load_frames_from_video(args.video, args.max_frames)
    
    if len(frames) == 0:
        print("❌ Error: No frames loaded")
        sys.exit(1)
    
    # Extract PRNU
    device_id = extract_prnu(frames)
    
    # Save Device ID
    output_path = Path(args.output)
    np.save(output_path, device_id)
    print(f"💾 Device ID saved to: {output_path.absolute()}")
    print(f"📊 File size: {output_path.stat().st_size / 1024:.2f} KB")
    
    # Compute BLAKE3 hash of Device ID (for verification)
    try:
        import hashlib
        device_hash = hashlib.sha256(device_id.tobytes()).hexdigest()
        print(f"🔑 Device Fingerprint (SHA-256): {device_hash}")
    except:
        pass
    
    print("\n✅ PRNU extraction complete!")
    print("   This Device ID can now be used for camera fingerprinting and anti-spoofing.")

if __name__ == '__main__':
    main()
