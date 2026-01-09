#!/usr/bin/env python3
"""
FaceID extraction and similarity checking using InsightFace
Input: reference photo path, candidate image path (or extract-only mode)
Output: JSON with similarity score and face detection results
"""

import sys
import json
import argparse
import os
import warnings
from pathlib import Path

# Suppress warnings to reduce noise in stdout
warnings.filterwarnings("ignore")

try:
    import cv2
    import numpy as np
    from insightface import app as insightface_app
    from insightface.utils import face_align
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    IMPORT_ERROR = str(e)


def extract_face_embedding(image_path, face_app):
    """Extract face embedding from image using InsightFace"""
    if not DEPENDENCIES_AVAILABLE:
        return None, False
    
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None, False
        
        # Detect and extract face
        faces = face_app.get(img)
        
        if faces is None or len(faces) == 0:
            return None, False
        
        # Get embedding from first detected face
        face = faces[0]
        embedding = face.normed_embedding
        
        return embedding.tolist(), True
    except Exception as e:
        return None, False


def cosine_similarity(embed1, embed2):
    """Calculate cosine similarity between two embeddings"""
    if embed1 is None or embed2 is None:
        return 0.0
    
    try:
        vec1 = np.array(embed1)
        vec2 = np.array(embed2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        similarity = dot_product / (norm1 * norm2)
        return float(similarity)
    except Exception:
        return 0.0


def main():
    parser = argparse.ArgumentParser(description='FaceID extraction and similarity checking')
    parser.add_argument('--extract-only', action='store_true', help='Extract embedding only, save to JSON')
    parser.add_argument('--reference', type=str, help='Path to reference photo')
    parser.add_argument('--candidate', type=str, help='Path to candidate image (for similarity check)')
    parser.add_argument('--output', type=str, help='Output JSON path (for extract-only mode)')
    
    args = parser.parse_args()
    
    if not DEPENDENCIES_AVAILABLE:
        result = {
            "ok": False,
            "error": "DEPENDENCIES_MISSING",
            "message": f"Required Python packages not installed: {IMPORT_ERROR}",
            "required_packages": ["opencv-python", "insightface", "numpy"]
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Initialize InsightFace
    try:
        face_app = insightface_app.FaceAnalysis(providers=['CPUExecutionProvider'])
        face_app.prepare(ctx_id=-1, det_size=(640, 640))
    except Exception as e:
        result = {
            "ok": False,
            "error": "INIT_FAILED",
            "message": f"Failed to initialize InsightFace: {str(e)}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Extract-only mode: save reference embedding
    if args.extract_only:
        if not args.reference:
            result = {
                "ok": False,
                "error": "MISSING_ARGS",
                "message": "extract-only mode requires --reference"
            }
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        
        if not os.path.exists(args.reference):
            result = {
                "ok": False,
                "error": "FILE_NOT_FOUND",
                "message": f"Reference photo not found: {args.reference}"
            }
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        
        embedding, face_detected = extract_face_embedding(args.reference, face_app)
        
        if not face_detected:
            result = {
                "ok": False,
                "error": "NO_FACE_DETECTED",
                "message": "No face detected in reference photo"
            }
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(1)
        
        # Build output data
        output_data = {
            "ok": True,
            "embedding": embedding,
            "embedding_dim": len(embedding),
            "face_detected": True,
            "reference_path": args.reference
        }
        
        # If --output is provided, write to file; otherwise print to stdout
        if args.output:
            # Ensure output directory exists
            output_dir = os.path.dirname(args.output)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            
            # Write JSON to file
            with open(args.output, 'w') as f:
                json.dump(output_data, f, ensure_ascii=False)
            
            # Send confirmation to stderr to keep stdout clean
            print(f"Saved embedding to {args.output}", file=sys.stderr)
        else:
            # Print JSON to stdout (original behavior)
            print(json.dumps(output_data, ensure_ascii=False))
        
        sys.exit(0)
    
    # Similarity check mode
    if not args.reference or not args.candidate:
        result = {
            "ok": False,
            "error": "MISSING_ARGS",
            "message": "Similarity check requires --reference and --candidate"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not os.path.exists(args.reference):
        result = {
            "ok": False,
            "error": "FILE_NOT_FOUND",
            "message": f"Reference photo not found: {args.reference}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not os.path.exists(args.candidate):
        result = {
            "ok": False,
            "error": "FILE_NOT_FOUND",
            "message": f"Candidate image not found: {args.candidate}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Extract embeddings
    ref_embedding, ref_face_detected = extract_face_embedding(args.reference, face_app)
    cand_embedding, cand_face_detected = extract_face_embedding(args.candidate, face_app)
    
    if not ref_face_detected:
        result = {
            "ok": False,
            "error": "NO_FACE_DETECTED",
            "message": "No face detected in reference photo",
            "face_detected_ref": False,
            "face_detected_candidate": cand_face_detected
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not cand_face_detected:
        result = {
            "ok": False,
            "error": "NO_FACE_DETECTED",
            "message": "No face detected in candidate image",
            "face_detected_ref": True,
            "face_detected_candidate": False
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Calculate similarity
    similarity = cosine_similarity(ref_embedding, cand_embedding)
    
    result = {
        "ok": True,
        "embedding_dim": len(ref_embedding),
        "similarity": similarity,
        "face_detected_ref": True,
        "face_detected_candidate": True
    }
    
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()

