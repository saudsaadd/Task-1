"""Swap the burned-in Arabic title for an English one, frame by frame.

Inputs : build/f/NNN.png (original frames), build/mask/NNN.png (character matte),
         build/plate.png (clean office background), build/track.json (title position)
Output : build/out/NNN.png

The Arabic title is removed from the background with the clean plate; where it
sat in front of the character (first second) the glyphs are inpainted. The
English title then follows the original motion: in front of Sparky's chin,
rising past his face and settling behind his helmet, fading out with the
office background.
"""
import json
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

N = 240
TITLE_LAST = 172          # last frame with any title
FRONT_LAST = 26           # title fully in front of the character up to here
DISSOLVE = {27: 0.66, 28: 0.33}   # front weight while it slips behind him
XFADE_FIRST = 150         # office background starts dissolving into the circuit board
CX = 641                  # title centre x
FONT = "assets/Poppins-Bold.ttf"
SS = 2                    # supersampling for the text layer

track = {int(k): v for k, v in json.load(open("build/track.json")).items()}
plate = cv2.imread("build/plate.png").astype(np.float32)
c_top = np.median(np.stack([cv2.imread(f"build/f/{i:03d}.png") for i in range(40, 91)]), 0).astype(np.float32)
# the title as a layer over the office: only where it differs from the plate and no frame had the character
_char = np.max(np.stack([cv2.imread(f"build/mask/{i:03d}.png", 0) for i in range(40, 91)]), 0)
_char = cv2.dilate((_char > 25).astype(np.uint8), np.ones((9, 9), np.uint8))
TEXT_LAYER = (c_top - plate) * ((np.abs(c_top - plate).max(2) > 12) & (_char == 0))[..., None]
TEXT_LAYER = cv2.GaussianBlur(TEXT_LAYER, (0, 0), 0.8)
circ = np.median(np.stack([cv2.imread(f"build/f/{i:03d}.png") for i in range(176, 201)]), 0).astype(np.float32)


# ------------------------------------------------------------------ title motion
def yc(i):
    if i <= 24:
        return 358.0
    if i <= 36:
        return float(track[i]["yc"])
    return 117.0 + 3.0 * min(1, (i - 37) / 113)


def scale(i):
    top = 1.0 - 0.013 * min(1, max(0, i - 37) / 113)
    if i <= 24:
        return 1.106
    if i <= 30:
        return (track[i]["x1"] - track[i]["x0"]) / 862
    if i <= 36:
        a = (i - 30) / 6
        return (track[30]["x1"] - track[30]["x0"]) / 862 * (1 - a) + 1.0 * a
    return top


def office_weight(i):
    """How much of the office layer (which carries the title) is still visible."""
    if i < XFADE_FIRST:
        return 1.0
    reg = (slice(470, 700), slice(0, 220))
    f = cv2.imread(f"build/f/{i:03d}.png").astype(np.float32)[reg]
    o, c = plate[reg], circ[reg]
    a = np.sum((f - o) * (c - o)) / np.sum((c - o) ** 2)
    return float(np.clip(1 - a, 0, 1))


# ------------------------------------------------------------------ English title layer
def build_word(text):
    font = ImageFont.truetype(FONT, 62 * SS)
    l, t, r, b = font.getbbox(text, anchor="ls")
    pad = 30 * SS
    w, h = r - l + 2 * pad, 200 * SS
    txt = Image.new("L", (w, h), 0)
    ImageDraw.Draw(txt).text((pad - l, h // 2 + 22 * SS), text, font=font, fill=255, anchor="ls")
    shadow = Image.new("L", (w, h), 0)
    shadow.paste(txt, (0, 5 * SS))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6 * SS))
    rgba = np.zeros((h, w, 4), np.float32)
    tt = np.asarray(txt, np.float32) / 255
    sh = np.asarray(shadow, np.float32) / 255 * 0.42
    a = tt + sh * (1 - tt)
    col = (np.array([250, 250, 250])[None, None] * tt[..., None]
           + np.array([55, 60, 70])[None, None] * (sh * (1 - tt))[..., None])
    rgba[..., :3] = col / np.maximum(a[..., None], 1e-6)
    rgba[..., 3] = a
    return rgba, pad, r - l          # layer, left padding, ink width (all at SS scale)


WORDS = {k: build_word(k) for k in ("Track One", "–", "Daily Tip")}


def layout(i):
    """x offsets (at title scale 1, relative to CX) of: left word's right edge, dash centre, right word's left edge."""
    together = (-38, -2, 34)          # one line across his chin, like the Arabic
    apart = (-160, -14, 132)          # around the helmet once the title is up top
    k = np.clip((i - 26) / 9, 0, 1)
    k = k * k * (3 - 2 * k)
    return [a + (b - a) * k for a, b in zip(together, apart)]


def place_title(i):
    """Return (bgr, alpha) full-frame layers for the English title at frame i."""
    sc = scale(i)
    rgb = np.zeros((720, 1280, 3), np.float32)
    alpha = np.zeros((720, 1280), np.float32)
    left, dash, right = layout(i)
    for word, anchor_x, side in (("Track One", left, "r"), ("–", dash, "c"), ("Daily Tip", right, "l")):
        layer, pad, ink = WORDS[word]
        s = sc / SS
        lay = cv2.resize(layer, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        if 25 <= i <= 36:                           # vertical motion blur while it rises
            k = int(abs(yc(i) - yc(i - 1)) * 0.5) | 1
            if k > 1:
                lay = cv2.blur(lay, (1, k))
        ink_s, pad_s = ink * s, pad * s
        ax = CX + anchor_x * sc
        x0 = ax - pad_s - (ink_s if side == "r" else ink_s / 2 if side == "c" else 0)
        x0, y0 = int(round(x0)), int(round(yc(i) - 4 - lay.shape[0] / 2))
        lh, lw = lay.shape[:2]
        ys, xs, ye, xe = max(0, y0), max(0, x0), min(720, y0 + lh), min(1280, x0 + lw)
        if ye <= ys or xe <= xs:
            continue
        sub = lay[ys - y0:ye - y0, xs - x0:xe - x0]
        sa = sub[..., 3]
        # "over" composite of this word onto the title layer
        rgb[ys:ye, xs:xe] = rgb[ys:ye, xs:xe] * (1 - sa[..., None]) + sub[..., [2, 1, 0]] * sa[..., None]
        alpha[ys:ye, xs:xe] = alpha[ys:ye, xs:xe] * (1 - sa) + sa
    rgb = rgb / np.maximum(alpha[..., None], 1e-6) * (alpha[..., None] > 0)
    return rgb, alpha


def glint(i):
    """Travelling lens glint like the original's (frames 3-30), additive BGR layer."""
    if not 3 <= i <= 30:
        return None
    p = (i - 3) / 27
    x, y = 180 + p * 830, yc(i) + 2
    env = np.sin(np.pi * p) ** 0.6
    yy, xx = np.mgrid[0:720, 0:1280].astype(np.float32)
    core = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 14 ** 2))
    halo = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 60 ** 2)) * 0.35
    streak = np.exp(-((yy - y) ** 2) / (2 * 4 ** 2)) * np.exp(-((xx - x) ** 2) / (2 * 260 ** 2)) * 0.6
    g = (core + halo + streak) * env
    return np.stack([g * 255, g * 245, g * 235], -1)


# ------------------------------------------------------------------ Arabic removal
def band(i):
    if i <= 24:
        r0, r1 = 240, 465
    elif i <= 36:
        r0, r1 = int(yc(i) - 115), int(yc(i) + 125)
    else:
        r0, r1 = 30, 215
    w = np.zeros((720, 1280), np.float32)
    w[max(0, r0):min(720, r1), 40:1240] = 1
    return cv2.GaussianBlur(w, (0, 0), 8)


# glyphs that sit in front of the character in the opening second: always bright there
_stack = np.stack([cv2.cvtColor(cv2.imread(f"build/f/{i:03d}.png"), cv2.COLOR_BGR2HSV) for i in range(1, 23)])
GLYPH_FRONT = ((_stack[..., 2].min(0) > 200) & (_stack[..., 1].max(0) < 70)).astype(np.uint8)
GLYPH_FRONT[:300] = 0
GLYPH_FRONT[412:] = 0


# clean look of the character (title already up and behind him) used to rebuild what the
# title covered while it sat in front of him
REF = np.median(np.stack([cv2.imread(f"build/f/{i:03d}.png") for i in range(34, 41)]), 0).astype(np.float32)
_ALIGN = (slice(420, 560), slice(430, 850))


def ref_for(f):
    """Shift REF onto frame f using the vest (never under the title) as the anchor."""
    a = cv2.cvtColor(REF.astype(np.uint8), cv2.COLOR_BGR2GRAY)[_ALIGN].astype(np.float32)
    b = cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2GRAY)[_ALIGN].astype(np.float32)
    (dx, dy), _ = cv2.phaseCorrelate(a, b)
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(REF, M, (1280, 720), borderMode=cv2.BORDER_REPLICATE)


def glyphs_on_character(i, f, ref, m):
    if i <= 20:
        g = GLYPH_FRONT.copy()
    else:
        hsv = cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
        rhsv = cv2.cvtColor(np.clip(ref, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
        g = ((hsv[..., 2] - rhsv[..., 2] > 16) & (hsv[..., 1] < 90)).astype(np.uint8)
        r0 = int(yc(i) - 48)
        g[:max(0, r0)] = 0
        g[r0 + 110:] = 0
        if i <= 24:
            g |= GLYPH_FRONT
        g = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    g = cv2.dilate(g, np.ones((5, 5), np.uint8))
    g = cv2.dilate(g, np.ones((9, 1), np.uint8), anchor=(0, 7))     # include the drop shadow below
    return ((g > 0) & (m > 0.3)).astype(np.uint8)


def remove_arabic(i, f, m):
    # treat the soft fringe of the matte as background so no glyph edges survive next to the helmet
    hard = np.clip((m - 0.55) / 0.35, 0, 1)
    hard = hard * hard * (3 - 2 * hard)
    msoft = cv2.GaussianBlur(hard, (0, 0), 1.0)
    w = band(i) * (1 - msoft)
    if i < XFADE_FIRST:
        clean = plate
    else:
        k = office_weight(i)
        clean = k * plate + (1 - k) * circ
    out = f * (1 - w[..., None]) + clean * w[..., None]
    if i <= 29:
        ref = ref_for(f)
        g = glyphs_on_character(i, f, ref, m)
        # trust the reference only where it matches this frame around the glyphs
        valid = ((m > 0.5) & (cv2.dilate(g, np.ones((7, 7), np.uint8)) == 0)).astype(np.float32)
        diff = np.abs(f - ref).mean(2) * valid
        err = cv2.GaussianBlur(diff, (0, 0), 7) / (cv2.GaussianBlur(valid, (0, 0), 7) + 1e-3)
        use_ref = (g > 0) & (err < 14)
        paint = ((g > 0) & ~use_ref).astype(np.uint8)
        use_ref = use_ref.astype(np.uint8)
        if use_ref.any():
            wr = cv2.GaussianBlur(use_ref.astype(np.float32), (0, 0), 1.5)[..., None]
            out = out * (1 - wr) + ref * wr
        if paint.any():
            out = cv2.inpaint(np.clip(out, 0, 255).astype(np.uint8), paint, 7, cv2.INPAINT_TELEA).astype(np.float32)
    return out


def main(frames):
    os.makedirs("build/out", exist_ok=True)
    for i in frames:
        f = cv2.imread(f"build/f/{i:03d}.png").astype(np.float32)
        if i > TITLE_LAST:
            cv2.imwrite(f"build/out/{i:03d}.png", f.astype(np.uint8))
            continue
        m = cv2.imread(f"build/mask/{i:03d}.png", 0).astype(np.float32) / 255
        out = remove_arabic(i, f, m)

        rgb, a = place_title(i)
        a = a * office_weight(i)
        if i <= FRONT_LAST:
            a_eff = a
        elif i in DISSOLVE:
            k = DISSOLVE[i]
            a_eff = a * (k + (1 - k) * (1 - m))
        else:
            a_eff = a * (1 - m)
        out = out * (1 - a_eff[..., None]) + rgb * a_eff[..., None]
        gl = glint(i)
        if gl is not None:
            out = out + gl
        cv2.imwrite(f"build/out/{i:03d}.png", np.clip(out, 0, 255).astype(np.uint8))
        if i % 40 == 0:
            print("frame", i, flush=True)


if __name__ == "__main__":
    import sys
    main([int(a) for a in sys.argv[1].split(",")] if len(sys.argv) > 1 else range(1, N + 1))
