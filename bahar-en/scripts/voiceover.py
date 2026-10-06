"""English voiceover placed on the original speech slots (so the lip movement stays in step).

Usage: python3 scripts/voiceover.py [--voice am_michael]   (Kokoro model in $KOKORO_DIR)
"""
import argparse
import json
import os

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer

# start of each Arabic phrase in the original clip, the latest the English line may end
# (just before the next phrase), and the English line
LINES = [
    (0.12, 3.35, "Track One, designed for my colleagues at Bahra Group."),
    (3.45, 6.25, "We'll meet every day to share a daily tip,"),
    (6.38, 9.95, "gaining technical skills and know-how that boost our efficiency."),
]
DURATION = 10.005


def trim(s, sr, thr=0.004):
    idx = np.where(np.abs(s) > thr)[0]
    return s[max(0, idx[0] - int(.02 * sr)): idx[-1] + int(.04 * sr)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="am_michael")
    args = ap.parse_args()
    d = os.environ.get("KOKORO_DIR", "models")
    k = Kokoro(os.path.join(d, "kokoro-v1.0.onnx"), os.path.join(d, "voices-v1.0.bin"))
    tok = Tokenizer()
    sr = 24000
    track = np.zeros(int(DURATION * sr), np.float32)
    info = []
    for a, b, text in LINES:
        slot = b - a
        speed = 1.0
        # say "Bahra" with the h (BAH-hra), not "Barra"
        phonemes = tok.phonemize(text, "en-us").replace("bˈɑːɹə", "bˈɑːhɹə")
        while True:  # speed up a little until the line fits its slot
            s, sr = k.create(phonemes, voice=args.voice, speed=speed, lang="en-us", is_phonemes=True)
            s = trim(np.asarray(s, np.float32), sr)
            if len(s) / sr <= slot or speed >= 1.25:
                break
            speed = round(speed + 0.03, 2)
        start = a
        i = int(start * sr)
        track[i:i + len(s)] += s[: len(track) - i]
        info.append({"text": text, "start": round(start, 3), "dur": round(len(s) / sr, 3), "speed": speed})
        print(f"{start:5.2f}s +{len(s)/sr:4.2f}s (slot {slot:.2f}, speed {speed})  {text}")
    track = track / np.abs(track).max() * 0.89
    os.makedirs("build", exist_ok=True)
    sf.write("build/voice_en.wav", track, sr)
    json.dump(info, open("build/voice_en.json", "w"), indent=1)


if __name__ == "__main__":
    main()
