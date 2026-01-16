#!/usr/bin/env python3
"""
Face Compositing Tool - Deterministic face replacement using landmark alignment

This script replaces the face in a generated page image with the hero_head face
using landmark-based alignment and Poisson blending (seamlessClone).

Workflow:
1. Detect face landmarks in both images (hero_head = source, page = target)
2. Compute affine transform from hero landmarks to page landmarks
3. Warp hero_head to match page face position/scale/rotation
4. Create soft elliptical mask for face region
5. Color match hero to page lighting
6. Blend using OpenCV seamlessClone (Poisson blending)

Output: JSON with result info, composited image saved to output path
"""

import sys
import json
import argparse
import os
import warnings
from pathlib import Path

# Suppress warnings to reduce noise
warnings.filterwarnings("ignore")

# Check dependencies
DEPENDENCIES_AVAILABLE = True
IMPORT_ERROR = None

try:
    import cv2
    import numpy as np
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    IMPORT_ERROR = f"OpenCV/NumPy: {str(e)}"

try:
    from insightface import app as insightface_app
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False

# Global face detector (lazy init)
_face_app = None

def get_face_app():
    """Get or initialize InsightFace detector"""
    global _face_app
    if _face_app is None and INSIGHTFACE_AVAILABLE:
        try:
            _face_app = insightface_app.FaceAnalysis(providers=['CPUExecutionProvider'])
            _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        except Exception as e:
            print(f"Warning: Failed to init InsightFace: {e}", file=sys.stderr)
            return None
    return _face_app


def detect_face_landmarks(image, face_app):
    """
    Detect face and extract 5-point landmarks using InsightFace
    Returns: (landmarks_5pt, bbox, face_detected)
    landmarks_5pt: [left_eye, right_eye, nose, left_mouth, right_mouth]
    """
    if face_app is None:
        return None, None, False
    
    try:
        faces = face_app.get(image)
        if faces is None or len(faces) == 0:
            return None, None, False
        
        # Get the largest face (by bbox area)
        best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        
        # InsightFace provides kps (5 keypoints)
        if best_face.kps is None:
            return None, None, False
        
        landmarks_5pt = best_face.kps.astype(np.float32)
        bbox = best_face.bbox.astype(np.float32)
        
        return landmarks_5pt, bbox, True
    except Exception as e:
        print(f"Face detection error: {e}", file=sys.stderr)
        return None, None, False


def select_main_face(faces, image_shape):
    """
    Select the main character face from multiple detected faces.
    Heuristics:
    1. Largest face by area
    2. If tied, prefer face closest to center
    """
    if not faces or len(faces) == 0:
        return None
    
    if len(faces) == 1:
        return faces[0]
    
    h, w = image_shape[:2]
    center = np.array([w / 2, h / 2])
    
    def score_face(face):
        bbox = face.bbox
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        face_center = np.array([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2])
        dist_to_center = np.linalg.norm(face_center - center)
        # Prefer larger faces (higher area score) that are closer to center
        return area - dist_to_center * 10  # Weight area more than position
    
    return max(faces, key=score_face)


def compute_similarity_transform(src_pts, dst_pts):
    """
    Compute similarity transform (scale, rotation, translation) from src to dst.
    Uses 3 points (eyes + nose) for stable estimation.
    """
    # Use left eye, right eye, nose for transform
    src = src_pts[:3].astype(np.float32)
    dst = dst_pts[:3].astype(np.float32)
    
    # Estimate affine transform
    transform, _ = cv2.estimateAffinePartial2D(src, dst)
    
    if transform is None:
        # Fallback: use all 5 points
        transform, _ = cv2.estimateAffinePartial2D(src_pts, dst_pts)
    
    return transform


def create_face_mask(image_shape, landmarks, bbox, expansion=1.3):
    """
    Create soft elliptical mask covering face region.
    expansion: How much to expand the mask beyond detected bbox (1.0 = exact, 1.3 = 30% larger)
    """
    h, w = image_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # Calculate face center and size from bbox
    x1, y1, x2, y2 = bbox
    face_w = (x2 - x1) * expansion
    face_h = (y2 - y1) * expansion * 1.2  # Slightly taller to include forehead
    center_x = int((x1 + x2) / 2)
    center_y = int((y1 + y2) / 2 - face_h * 0.05)  # Shift up slightly
    
    # Draw filled ellipse
    axes = (int(face_w / 2), int(face_h / 2))
    cv2.ellipse(mask, (center_x, center_y), axes, 0, 0, 360, 255, -1)
    
    # Gaussian blur for soft edges
    mask = cv2.GaussianBlur(mask, (31, 31), 15)
    
    return mask


def create_hair_extended_mask(image_shape, landmarks, bbox, expansion=1.4):
    """
    Create mask that includes face and extends upward for hair.
    Better for hero_head which includes hair.
    """
    h, w = image_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # Calculate face region from bbox
    x1, y1, x2, y2 = bbox
    face_w = (x2 - x1) * expansion
    face_h = (y2 - y1) * expansion
    center_x = int((x1 + x2) / 2)
    
    # Extend upward for hair (shift center up by 15% of face height)
    center_y = int((y1 + y2) / 2 - face_h * 0.15)
    
    # Make it taller to include hair
    hair_extension = 1.5  # 50% taller to include hair
    axes = (int(face_w / 2), int(face_h * hair_extension / 2))
    
    cv2.ellipse(mask, (center_x, center_y), axes, 0, 0, 360, 255, -1)
    
    # Gaussian blur for soft edges
    mask = cv2.GaussianBlur(mask, (41, 41), 20)
    
    return mask


def color_match_lab(source, target, mask):
    """
    Match source image colors to target using LAB color space mean/std transfer.
    Only considers pixels within mask region.
    """
    # Convert to LAB
    source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
    target_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
    
    # Get mask as boolean
    mask_bool = mask > 128
    
    # Calculate stats for each channel
    result_lab = source_lab.copy()
    
    for c in range(3):
        src_channel = source_lab[:, :, c]
        tgt_channel = target_lab[:, :, c]
        
        # Get stats from masked regions
        src_mean = np.mean(src_channel[mask_bool]) if np.any(mask_bool) else np.mean(src_channel)
        src_std = np.std(src_channel[mask_bool]) if np.any(mask_bool) else np.std(src_channel)
        tgt_mean = np.mean(tgt_channel[mask_bool]) if np.any(mask_bool) else np.mean(tgt_channel)
        tgt_std = np.std(tgt_channel[mask_bool]) if np.any(mask_bool) else np.std(tgt_channel)
        
        # Avoid division by zero
        if src_std < 1:
            src_std = 1
        
        # Transfer: normalize to target distribution
        result_lab[:, :, c] = (src_channel - src_mean) * (tgt_std / src_std) + tgt_mean
    
    # Clip to valid range and convert back
    result_lab = np.clip(result_lab, 0, 255).astype(np.uint8)
    result = cv2.cvtColor(result_lab, cv2.COLOR_LAB2BGR)
    
    return result


def seamless_clone_safe(src, dst, mask, center):
    """
    Perform seamless clone with fallback to alpha blending if it fails.
    """
    try:
        result = cv2.seamlessClone(src, dst, mask, center, cv2.NORMAL_CLONE)
        return result, "seamless_clone"
    except Exception as e:
        print(f"seamlessClone failed: {e}, falling back to alpha blend", file=sys.stderr)
        
        # Fallback: alpha blending
        mask_float = mask.astype(np.float32) / 255.0
        mask_3ch = np.dstack([mask_float] * 3)
        
        result = (src * mask_3ch + dst * (1 - mask_3ch)).astype(np.uint8)
        return result, "alpha_blend"


def composite_face(hero_head_path, page_image_path, output_path, include_hair=True):
    """
    Main compositing function.
    
    Args:
        hero_head_path: Path to hero_head image (source face)
        page_image_path: Path to generated page image (target)
        output_path: Where to save the composited result
        include_hair: If True, use extended mask that includes hair
    
    Returns:
        dict with result info
    """
    face_app = get_face_app()
    
    if face_app is None:
        return {
            "ok": False,
            "error": "FACE_DETECTOR_UNAVAILABLE",
            "message": "InsightFace not available"
        }
    
    # Load images
    hero = cv2.imread(hero_head_path)
    page = cv2.imread(page_image_path)
    
    if hero is None:
        return {
            "ok": False,
            "error": "HERO_HEAD_NOT_FOUND",
            "message": f"Cannot read hero_head: {hero_head_path}"
        }
    
    if page is None:
        return {
            "ok": False,
            "error": "PAGE_IMAGE_NOT_FOUND",
            "message": f"Cannot read page image: {page_image_path}"
        }
    
    # Detect faces
    hero_landmarks, hero_bbox, hero_detected = detect_face_landmarks(hero, face_app)
    
    if not hero_detected:
        return {
            "ok": False,
            "error": "NO_FACE_IN_HERO",
            "message": "No face detected in hero_head image"
        }
    
    # Detect all faces in page, then select main one
    try:
        page_faces = face_app.get(page)
        main_face = select_main_face(page_faces, page.shape) if page_faces else None
        
        if main_face is None:
            return {
                "ok": False,
                "error": "NO_FACE_IN_PAGE",
                "message": "No face detected in page image"
            }
        
        page_landmarks = main_face.kps.astype(np.float32)
        page_bbox = main_face.bbox.astype(np.float32)
    except Exception as e:
        return {
            "ok": False,
            "error": "PAGE_FACE_DETECTION_FAILED",
            "message": str(e)
        }
    
    # Compute transform
    transform = compute_similarity_transform(hero_landmarks, page_landmarks)
    
    if transform is None:
        return {
            "ok": False,
            "error": "TRANSFORM_FAILED",
            "message": "Could not compute similarity transform"
        }
    
    # Warp hero_head to page space
    warped_hero = cv2.warpAffine(
        hero, 
        transform, 
        (page.shape[1], page.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE
    )
    
    # Create mask in page space (around page face position)
    if include_hair:
        mask = create_hair_extended_mask(page.shape, page_landmarks, page_bbox)
    else:
        mask = create_face_mask(page.shape, page_landmarks, page_bbox)
    
    # Color match warped hero to page lighting
    warped_hero_matched = color_match_lab(warped_hero, page, mask)
    
    # Calculate blend center
    center_x = int((page_bbox[0] + page_bbox[2]) / 2)
    center_y = int((page_bbox[1] + page_bbox[3]) / 2)
    
    # Adjust center for hair (move up slightly)
    if include_hair:
        face_h = page_bbox[3] - page_bbox[1]
        center_y = int(center_y - face_h * 0.1)
    
    # Perform seamless clone
    result, blend_method = seamless_clone_safe(
        warped_hero_matched,
        page,
        mask,
        (center_x, center_y)
    )
    
    # Save result
    cv2.imwrite(output_path, result)
    
    return {
        "ok": True,
        "output_path": output_path,
        "blend_method": blend_method,
        "hero_bbox": hero_bbox.tolist(),
        "page_bbox": page_bbox.tolist(),
        "transform_applied": True
    }


def main():
    parser = argparse.ArgumentParser(description='Face compositing for storybook pages')
    parser.add_argument('--hero-head', type=str, required=True, help='Path to hero_head image (source)')
    parser.add_argument('--page-image', type=str, required=True, help='Path to page image (target)')
    parser.add_argument('--output', type=str, required=True, help='Output path for composited image')
    parser.add_argument('--include-hair', action='store_true', default=True, help='Include hair in mask (default: True)')
    parser.add_argument('--no-hair', action='store_true', help='Face only, no hair extension')
    
    args = parser.parse_args()
    
    if not DEPENDENCIES_AVAILABLE:
        result = {
            "ok": False,
            "error": "DEPENDENCIES_MISSING",
            "message": f"Required packages not installed: {IMPORT_ERROR}",
            "required_packages": ["opencv-python", "numpy", "insightface"]
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not INSIGHTFACE_AVAILABLE:
        result = {
            "ok": False,
            "error": "INSIGHTFACE_MISSING",
            "message": "InsightFace not installed. Install with: pip install insightface"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Validate input files
    if not os.path.exists(args.hero_head):
        result = {
            "ok": False,
            "error": "HERO_HEAD_NOT_FOUND",
            "message": f"Hero head not found: {args.hero_head}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not os.path.exists(args.page_image):
        result = {
            "ok": False,
            "error": "PAGE_IMAGE_NOT_FOUND",
            "message": f"Page image not found: {args.page_image}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Ensure output directory exists
    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    
    # Perform compositing
    include_hair = not args.no_hair
    result = composite_face(
        args.hero_head,
        args.page_image,
        args.output,
        include_hair=include_hair
    )
    
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()




