"""
Proof of Reality: Cross-Correlation Analysis for Replay Attack Detection

Python reference implementation for testing and validation.
Matches C++ implementation in proof_of_reality.cpp

Usage:
    python proof_of_reality.py <pulse1.csv> <pulse2.csv> <pulse3.csv>
"""

import numpy as np
import json
import sys
from typing import List, Dict, Tuple

def calculate_cross_correlation(pulse1: np.ndarray, pulse2: np.ndarray) -> float:
    """
    Calculate the Pearson correlation coefficient between two pulses.
    
    Parameters:
    pulse1 (numpy array): The first pulse signal.
    pulse2 (numpy array): The second pulse signal.
    
    Returns:
    float: The correlation coefficient [-1, 1].
    """
    # Handle different lengths by taking shorter
    min_len = min(len(pulse1), len(pulse2))
    pulse1 = pulse1[:min_len]
    pulse2 = pulse2[:min_len]
    
    # Pearson correlation
    return np.corrcoef(pulse1, pulse2)[0, 1]

def analyze_pulse_uniqueness(pulse_data: List[Dict], threshold: float = 0.95) -> Dict:
    """
    Analyze multiple pulse signals for uniqueness.
    
    Parameters:
    pulse_data: List of dicts with keys: face_id, bpm, signal
    threshold: Correlation threshold for replay detection (default 0.95)
    
    Returns:
    dict: Analysis results with correlations and replay flags
    """
    n_pulses = len(pulse_data)
    correlations = {}
    replay_flags = {}
    
    # Calculate pairwise correlations
    for i in range(n_pulses):
        for j in range(i + 1, n_pulses):
            pulse1 = np.array(pulse_data[i]['signal'])
            pulse2 = np.array(pulse_data[j]['signal'])
            
            face_id1 = pulse_data[i]['face_id']
            face_id2 = pulse_data[j]['face_id']
            pair_id = f"{face_id1}{face_id2}"
            
            corr = calculate_cross_correlation(pulse1, pulse2)
            correlations[pair_id] = float(corr)
            
            # Flag as replay attack if correlation > threshold
            is_replay = abs(corr) > threshold
            replay_flags[pair_id] = is_replay
            
            status = "⚠️  REPLAY ATTACK" if is_replay else "✅ Unique"
            print(f"Correlation between pulse {face_id1} and pulse {face_id2}: {corr:.4f} - {status}")
    
    # Check if all signals are unique
    all_unique = not any(replay_flags.values())
    
    return {
        'correlation_coefficients': correlations,
        'replay_attack_flags': replay_flags,
        'all_unique_signals': all_unique
    }

def create_proof_of_reality_metadata(
    pulse_data: List[Dict],
    consensus_hash: str,
    hardware_dna: str,
    video_frame_hash: str,
    timestamp: int,
    verification_status: str
) -> Dict:
    """
    Create complete Proof of Reality metadata structure.
    """
    # Analyze correlations
    analysis = analyze_pulse_uniqueness(pulse_data)
    
    metadata = {
        'pulse_data': [
            {
                'face_id': p['face_id'],
                'bpm': p['bpm'],
                'confidence': p.get('confidence', 0.0),
                'signal_length': len(p['signal'])
            }
            for p in pulse_data
        ],
        'correlation_coefficients': analysis['correlation_coefficients'],
        'replay_attack_flags': analysis['replay_attack_flags'],
        'consensus_hash': consensus_hash,
        'hardware_dna': hardware_dna,
        'video_frame_hash': video_frame_hash,
        'timestamp': timestamp,
        'verification_status': verification_status,
        'all_unique_signals': analysis['all_unique_signals'],
        'detected_faces': len(pulse_data),
        'received_signatures': len(pulse_data)
    }
    
    return metadata

def main():
    """Example usage"""
    
    # Example: 3 pulse signals
    # In production, these come from rPPG extraction
    
    if len(sys.argv) > 1:
        # Load from CSV files
        pulse_data = []
        for i, filepath in enumerate(sys.argv[1:], start=1):
            signal = np.loadtxt(filepath, delimiter=',')
            bpm = int(np.mean(signal) * 60)  # Simplified BPM estimation
            pulse_data.append({
                'face_id': i,
                'bpm': bpm,
                'signal': signal.tolist(),
                'confidence': 0.85
            })
    else:
        # Demo with synthetic signals
        print("📊 Proof of Reality Demo - Synthetic Signals\n")
        
        # Pulse 1: Normal signal (68 BPM)
        pulse1 = np.sin(2 * np.pi * 1.13 * np.arange(300) / 30) + np.random.normal(0, 0.1, 300)
        
        # Pulse 2: Nearly identical to pulse1 (REPLAY ATTACK)
        pulse2 = pulse1 + np.random.normal(0, 0.05, 300)
        
        # Pulse 3: Different signal (75 BPM)
        pulse3 = np.sin(2 * np.pi * 1.25 * np.arange(300) / 30) + np.random.normal(0, 0.1, 300)
        
        pulse_data = [
            {'face_id': 1, 'bpm': 68, 'signal': pulse1.tolist(), 'confidence': 0.85},
            {'face_id': 2, 'bpm': 68, 'signal': pulse2.tolist(), 'confidence': 0.90},
            {'face_id': 3, 'bpm': 75, 'signal': pulse3.tolist(), 'confidence': 0.88}
        ]
    
    # Create metadata
    metadata = create_proof_of_reality_metadata(
        pulse_data=pulse_data,
        consensus_hash="a3f8e9d1c2b5a7f6e4d3c2b1a9f8e7d6c5b4a3f2e1d0",
        hardware_dna="prnu_fingerprint_device_12345",
        video_frame_hash="b2e7c1d3a4f5b6e7d8c9a0b1c2d3e4f5a6b7c8d9e0f1",
        timestamp=1738454400,
        verification_status="COMPLETE"
    )
    
    # Print summary
    print(f"\n📊 Proof of Reality Summary:")
    print(f"   Detected Faces: {metadata['detected_faces']}")
    print(f"   Unique Signals: {'✅ Yes' if metadata['all_unique_signals'] else '⚠️  No (replay attack detected)'}")
    print(f"   Verification: {metadata['verification_status']}")
    
    # List replay attacks
    replay_pairs = [pair for pair, flag in metadata['replay_attack_flags'].items() if flag]
    if replay_pairs:
        print(f"\n⚠️  Replay Attacks Detected:")
        for pair in replay_pairs:
            corr = metadata['correlation_coefficients'][pair]
            print(f"   Face pair {pair}: correlation = {corr:.4f} (> 0.95)")
    
    # Save to JSON
    output_file = 'proof_of_reality.json'
    with open(output_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n✅ Metadata saved to {output_file}")
    print(f"   Upload to IPFS and anchor on Polygon:")
    print(f"   node scripts/anchorProofOfReality.js {output_file} <videoIPFSCID>")

if __name__ == '__main__':
    main()
