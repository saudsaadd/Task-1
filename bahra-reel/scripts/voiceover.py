"""Generate the English voiceover with Kokoro TTS and write caption timings.

Each sentence is synthesized on its own so we know exactly when it starts and
ends; build/voiceover.wav is the full 60 s track and build/timeline.json feeds
the captions and product reveals in index.html.

Usage: python3 scripts/voiceover.py [--voice af_heart] [--speed 1.0]
Model files are looked up in $KOKORO_DIR (default: ./models).
"""
import argparse
import json
import os
import re

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")
TOTAL = 60.0
GAP = 0.45  # pause between sentences inside a scene

# (scene start, voiceover start, sentences)
SCENES = [
    (0.0, 1.3, [
        "Meet Sparky, your guide to superior electrical solutions!",
        "Welcome to Bahra Electric, where innovation meets absolute safety.",
    ]),
    (12.0, 12.9, [
        "From top-tier Wires and Cables to heavy-duty Transformers and Busbars,",
        "we deliver unmatched electrical performance for every project.",
    ]),
    (28.0, 28.9, [
        "We build the backbone of safety!",
        "Discover our reliable grounding systems, lightning protection, cable management, and durable distribution boards.",
    ]),
    (45.0, 46.0, [
        "From switches and sockets to complete industrial setups,",
        "Bahra Electric is your trusted partner for power.",
        "Choose quality, choose Bahra!",
    ]),
]


def trim(samples, sr, thresh=0.004):
    """Strip leading/trailing near-silence so sentence timings are tight."""
    idx = np.where(np.abs(samples) > thresh)[0]
    if len(idx) == 0:
        return samples
    pad = int(0.03 * sr)
    return samples[max(0, idx[0] - pad): idx[-1] + pad]


def word_times(text, start, dur):
    """Spread words over the sentence proportionally to their length."""
    words = text.split()
    # letters + a little per word, plus extra for the pause after a comma
    weights = [len(re.sub(r"[^\w]", "", w)) + 1.6 + (2.5 if w.endswith(",") else 0)
               for w in words]
    total = sum(weights)
    t, out = start, []
    for w, wt in zip(words, weights):
        d = dur * wt / total
        out.append({"w": w, "t": round(t, 3), "d": round(d, 3)})
        t += d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.94)
    args = ap.parse_args()

    model_dir = os.environ.get("KOKORO_DIR", os.path.join(ROOT, "models"))
    kokoro = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"),
                    os.path.join(model_dir, "voices-v1.0.bin"))

    os.makedirs(BUILD, exist_ok=True)
    sr = 24000
    track = np.zeros(int(TOTAL * sr), dtype=np.float32)
    timeline = {"voice": args.voice, "scenes": []}

    for i, (scene_start, vo_start, sentences) in enumerate(SCENES):
        next_start = SCENES[i + 1][0] if i + 1 < len(SCENES) else TOTAL
        t = vo_start
        scene = {"start": scene_start, "sentences": []}
        for text in sentences:
            samples, sr = kokoro.create(text, voice=args.voice, speed=args.speed, lang="en-us")
            samples = trim(np.asarray(samples, dtype=np.float32), sr)
            dur = len(samples) / sr
            a = int(t * sr)
            track[a:a + len(samples)] += samples[: len(track) - a]
            scene["sentences"].append({
                "text": text, "start": round(t, 3), "dur": round(dur, 3),
                "words": word_times(text, t, dur),
            })
            print(f"scene {i + 1}: {t:6.2f}s +{dur:5.2f}s  {text}")
            t += dur + GAP
        if t - GAP > next_start - 0.4:
            raise SystemExit(f"scene {i + 1} voiceover overruns into next scene ({t - GAP:.2f}s)")
        timeline["scenes"].append(scene)

    peak = np.max(np.abs(track))
    track = track / peak * 0.89
    sf.write(os.path.join(BUILD, "voiceover.wav"), track, sr)
    with open(os.path.join(BUILD, "timeline.json"), "w") as f:
        json.dump(timeline, f, indent=1)
    # index.html is opened from file://, so it reads the timeline as a script
    with open(os.path.join(BUILD, "timeline.js"), "w") as f:
        f.write("window.TIMELINE = " + json.dumps(timeline) + ";\n")
    print("wrote build/voiceover.wav, build/timeline.json and build/timeline.js")


if __name__ == "__main__":
    main()
