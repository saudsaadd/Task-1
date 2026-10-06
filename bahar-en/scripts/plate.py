"""Clean office background (no title, no character) and the title's position in every frame.

Writes build/plate.png and build/track.json. Needs build/f/ and build/mask/.
The title sits low in frames 1-24 and high in frames 40-91, so the upper rows
of the plate come from the first group and the lower rows from the second.
"""
import json

import cv2
import numpy as np


def masked_median(frames):
    stack = np.stack([cv2.imread(f"build/f/{i:03d}.png") for i in frames]).astype(np.float32)
    ms = np.stack([cv2.dilate(cv2.imread(f"build/mask/{i:03d}.png", 0), np.ones((7, 7), np.uint8)) for i in frames])
    stack[ms > 25] = np.nan
    with np.errstate(all="ignore"):
        med = np.nanmedian(stack, 0)
    hole = np.isnan(med).any(2)
    return np.nan_to_num(med), hole


def main():
    top, h1 = masked_median(range(1, 25))
    low, h2 = masked_median(range(40, 92))
    plate, hole = low.copy(), h2.copy()
    plate[:250], hole[:250] = top[:250], h1[:250]
    plate = cv2.inpaint(np.clip(plate, 0, 255).astype(np.uint8), hole.astype(np.uint8), 5, cv2.INPAINT_TELEA)
    cv2.imwrite("build/plate.png", plate)

    pl = cv2.cvtColor(plate, cv2.COLOR_BGR2GRAY).astype(np.float32)
    track = {}
    for i in range(1, 181):
        g = cv2.cvtColor(cv2.imread(f"build/f/{i:03d}.png"), cv2.COLOR_BGR2GRAY).astype(np.float32)
        m = cv2.imread(f"build/mask/{i:03d}.png", 0).astype(np.float32) / 255 if i <= 172 else np.zeros_like(g)
        t = ((g - pl) > 28) & (m < 0.2)
        t[:30] = False
        t[450:] = False
        t[:, :70] = False
        t[:, 1210:] = False
        t = cv2.morphologyEx(t.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        ys, xs = np.nonzero(t)
        if len(ys) < 300:
            track[i] = None
            continue
        y0, y1 = np.percentile(ys, [3, 97])
        x0, x1 = np.percentile(xs, [1, 99])
        track[i] = dict(n=int(len(ys)), y0=float(y0), y1=float(y1), yc=float(np.median(ys)), x0=float(x0), x1=float(x1))
    json.dump(track, open("build/track.json", "w"))
    print("wrote build/plate.png and build/track.json")


if __name__ == "__main__":
    main()
