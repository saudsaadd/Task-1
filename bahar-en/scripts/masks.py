"""Character matte for every frame: ISNet edges, limited to U2Net's human region (drops title glyphs)."""
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from segment import Matte  # noqa: E402

D = os.environ.get("SEG_DIR", "models")
isnet = Matte(os.path.join(D, "isnet-general-use.onnx"), "isnet-general-use")
human = Matte(os.path.join(D, "u2net_human_seg.onnx"), "u2net_human_seg")
first, last = int(sys.argv[1]), int(sys.argv[2])
for i in range(first, last + 1):
    bgr = cv2.imread(f"build/f/{i:03d}.png")
    rgb = np.ascontiguousarray(bgr[:, :, ::-1])
    a = isnet(rgb)
    h0 = (human(rgb) > 0.35).astype(np.uint8)
    h = cv2.dilate(h0, np.ones((25, 25), np.uint8))
    # around the head the title runs right up to the helmet: keep the limit tight there
    h[:300] = cv2.dilate(h0, np.ones((9, 9), np.uint8))[:300]
    h = cv2.GaussianBlur(h.astype(np.float32), (0, 0), 3)
    m = np.clip(a * np.minimum(1, h * 1.5), 0, 1)
    cv2.imwrite(f"build/mask/{i:03d}.png", (m * 255).astype(np.uint8))
    if i % 20 == 0:
        print("mask", i, flush=True)
