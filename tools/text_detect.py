#!/usr/bin/env python3
"""
Text Detection Tool - Detect unwanted text in generated images

Uses OpenCV EAST text detector for fast text detection.
Falls back to basic edge/contour analysis if EAST model unavailable.

This is used as a post-check to ensure generated images don't contain
unwanted text, watermarks, signatures, or logos.

Output: JSON with detection result and any text regions found
"""

import sys
import json
import argparse
import os
import warnings
from pathlib import Path

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

# Optional: pytesseract for OCR verification
PYTESSERACT_AVAILABLE = False
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    pass

# EAST model path (can be overridden by env var)
EAST_MODEL_PATH = os.environ.get("EAST_MODEL_PATH", "")


def download_east_model(model_dir):
    """
    Download EAST text detection model if not present.
    Returns path to model file or None if download fails.
    """
    model_path = os.path.join(model_dir, "frozen_east_text_detection.pb")
    
    if os.path.exists(model_path):
        return model_path
    
    # The EAST model needs to be downloaded separately
    # Return None to use fallback detection
    return None


def detect_text_east(image, model_path, conf_threshold=0.5):
    """
    Detect text using EAST (Efficient and Accurate Scene Text) detector.
    Returns list of text region bounding boxes.
    """
    if not os.path.exists(model_path):
        return None, "EAST model not found"
    
    try:
        # Load EAST model
        net = cv2.dnn.readNet(model_path)
        
        # Get image dimensions
        orig_h, orig_w = image.shape[:2]
        
        # EAST requires dimensions to be multiples of 32
        new_w = (orig_w // 32) * 32
        new_h = (orig_h // 32) * 32
        
        # Resize
        ratio_w = orig_w / float(new_w)
        ratio_h = orig_h / float(new_h)
        
        blob = cv2.dnn.blobFromImage(
            image, 1.0, (new_w, new_h),
            (123.68, 116.78, 103.94), swapRB=True, crop=False
        )
        
        # Define output layers
        output_layers = [
            "feature_fusion/Conv_7/Sigmoid",
            "feature_fusion/concat_3"
        ]
        
        net.setInput(blob)
        scores, geometry = net.forward(output_layers)
        
        # Decode predictions
        boxes, confidences = decode_predictions(scores, geometry, conf_threshold)
        
        # Apply NMS
        indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, 0.4)
        
        results = []
        if len(indices) > 0:
            for i in indices.flatten():
                x, y, w, h = boxes[i]
                results.append({
                    "x": int(x * ratio_w),
                    "y": int(y * ratio_h),
                    "w": int(w * ratio_w),
                    "h": int(h * ratio_h),
                    "confidence": float(confidences[i])
                })
        
        return results, None
    except Exception as e:
        return None, str(e)


def decode_predictions(scores, geometry, conf_threshold):
    """Decode EAST model predictions"""
    num_rows, num_cols = scores.shape[2:4]
    boxes = []
    confidences = []
    
    for y in range(num_rows):
        scores_data = scores[0, 0, y]
        x_data0 = geometry[0, 0, y]
        x_data1 = geometry[0, 1, y]
        x_data2 = geometry[0, 2, y]
        x_data3 = geometry[0, 3, y]
        angles_data = geometry[0, 4, y]
        
        for x in range(num_cols):
            if scores_data[x] < conf_threshold:
                continue
            
            offset_x = x * 4.0
            offset_y = y * 4.0
            
            angle = angles_data[x]
            cos = np.cos(angle)
            sin = np.sin(angle)
            
            h = x_data0[x] + x_data2[x]
            w = x_data1[x] + x_data3[x]
            
            end_x = int(offset_x + (cos * x_data1[x]) + (sin * x_data2[x]))
            end_y = int(offset_y - (sin * x_data1[x]) + (cos * x_data2[x]))
            start_x = int(end_x - w)
            start_y = int(end_y - h)
            
            boxes.append([start_x, start_y, int(w), int(h)])
            confidences.append(float(scores_data[x]))
    
    return boxes, confidences


def detect_text_fallback(image, min_area=500):
    """
    Fallback text detection using edge detection and contour analysis.
    Less accurate but works without external models.
    
    Looks for:
    - Regions with high edge density (text has lots of edges)
    - Horizontal/rectangular shapes (typical of text blocks)
    - Regions with specific aspect ratios
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Edge detection
    edges = cv2.Canny(gray, 50, 150)
    
    # Morphological operations to connect text regions
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3))
    dilated = cv2.dilate(edges, kernel, iterations=2)
    
    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    text_regions = []
    img_area = image.shape[0] * image.shape[1]
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        aspect_ratio = w / h if h > 0 else 0
        
        # Filter by size and aspect ratio (text is usually wider than tall)
        if area < min_area or area > img_area * 0.3:
            continue
        if aspect_ratio < 1.5 or aspect_ratio > 20:  # Text blocks are horizontal
            continue
        
        # Check edge density in region
        region = edges[y:y+h, x:x+w]
        edge_density = np.sum(region > 0) / (w * h) if w * h > 0 else 0
        
        # Text regions typically have moderate edge density
        if edge_density < 0.1 or edge_density > 0.7:
            continue
        
        text_regions.append({
            "x": int(x),
            "y": int(y),
            "w": int(w),
            "h": int(h),
            "confidence": float(edge_density),
            "method": "fallback"
        })
    
    return text_regions


def verify_text_with_ocr(image, regions):
    """
    Use pytesseract to verify if regions actually contain text.
    Returns filtered regions that likely contain real text.
    """
    if not PYTESSERACT_AVAILABLE or not regions:
        return regions
    
    verified = []
    
    for region in regions:
        x, y, w, h = region["x"], region["y"], region["w"], region["h"]
        
        # Extract region
        roi = image[y:y+h, x:x+w]
        if roi.size == 0:
            continue
        
        # Run OCR
        try:
            text = pytesseract.image_to_string(roi, config="--psm 7").strip()
            if len(text) >= 2:  # At least 2 characters
                region["ocr_text"] = text[:50]  # Truncate
                region["verified"] = True
                verified.append(region)
        except Exception:
            pass
    
    return verified


def detect_watermark_signature(image):
    """
    Detect potential watermarks or signatures in corners.
    These are often placed in bottom-right corner.
    """
    h, w = image.shape[:2]
    
    # Define corner regions to check
    corners = {
        "bottom_right": image[int(h*0.8):h, int(w*0.7):w],
        "bottom_left": image[int(h*0.8):h, 0:int(w*0.3)],
        "top_right": image[0:int(h*0.15), int(w*0.7):w],
        "top_left": image[0:int(h*0.15), 0:int(w*0.3)]
    }
    
    suspicious_corners = []
    
    for corner_name, corner_img in corners.items():
        if corner_img.size == 0:
            continue
        
        # Check for text-like patterns in corner
        gray = cv2.cvtColor(corner_img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / edges.size if edges.size > 0 else 0
        
        # Corners with text (watermarks/signatures) have higher edge density
        if edge_density > 0.15:
            suspicious_corners.append({
                "location": corner_name,
                "edge_density": float(edge_density)
            })
    
    return suspicious_corners


def main():
    parser = argparse.ArgumentParser(description='Text detection in images')
    parser.add_argument('--image', type=str, required=True, help='Path to image')
    parser.add_argument('--east-model', type=str, default=EAST_MODEL_PATH, help='Path to EAST model')
    parser.add_argument('--threshold', type=float, default=0.5, help='Confidence threshold')
    parser.add_argument('--verify-ocr', action='store_true', help='Use OCR to verify detections')
    
    args = parser.parse_args()
    
    if not DEPENDENCIES_AVAILABLE:
        result = {
            "ok": False,
            "error": "DEPENDENCIES_MISSING",
            "message": f"Required packages not installed: {IMPORT_ERROR}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    if not os.path.exists(args.image):
        result = {
            "ok": False,
            "error": "IMAGE_NOT_FOUND",
            "message": f"Image not found: {args.image}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    # Load image
    image = cv2.imread(args.image)
    if image is None:
        result = {
            "ok": False,
            "error": "IMAGE_READ_FAILED",
            "message": f"Could not read image: {args.image}"
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)
    
    text_regions = []
    detection_method = "none"
    
    # Try EAST detector first
    if args.east_model and os.path.exists(args.east_model):
        regions, error = detect_text_east(image, args.east_model, args.threshold)
        if regions is not None:
            text_regions = regions
            detection_method = "east"
    
    # Fallback to edge-based detection
    if not text_regions:
        text_regions = detect_text_fallback(image)
        detection_method = "fallback"
    
    # Optionally verify with OCR
    if args.verify_ocr and PYTESSERACT_AVAILABLE:
        text_regions = verify_text_with_ocr(image, text_regions)
        detection_method += "+ocr"
    
    # Check for watermarks/signatures in corners
    suspicious_corners = detect_watermark_signature(image)
    
    # Determine if text was detected
    has_text = len(text_regions) > 0
    has_watermark = len(suspicious_corners) > 0
    
    result = {
        "ok": True,
        "text_detected": has_text,
        "watermark_suspected": has_watermark,
        "text_regions": text_regions,
        "suspicious_corners": suspicious_corners,
        "detection_method": detection_method,
        "pytesseract_available": PYTESSERACT_AVAILABLE
    }
    
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()




