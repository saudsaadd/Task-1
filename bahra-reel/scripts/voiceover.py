"""Generate the voiceover and write caption / animation timings.

Each sentence is synthesized on its own so we know exactly when it starts and
ends; build/voiceover.wav is the full 60 s track and build/timeline.json feeds
the captions and the animation cues in js/main.js.

A `{cue}` marker in front of a word names the moment that word is spoken
(e.g. `{wires}` makes the Wires & Cables card pop in); every script must
define the same cue names. `shown~spoken` lets a word be written one way in
the captions and pronounced another way.

Usage:
  python3 scripts/voiceover.py                        English, Kokoro voice af_heart
  python3 scripts/voiceover.py --lang ar              Modern Standard Arabic, Piper voice ar_JO-kareem
  python3 scripts/voiceover.py --lang ar-sa           Saudi dialect, same voice
Model files are looked up in $KOKORO_DIR / $PIPER_AR_DIR (default: ./models/...).
"""
import argparse
import json
import os
import re

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")
TOTAL = 60.0
GAP = 0.45  # pause between sentences inside a scene

# (scene start, voiceover start, sentences); a sentence may be (text, earliest start)
SCRIPTS = {
    "en": [
        (0.0, 1.3, [
            "Meet {sparky}Sparky, your guide to superior electrical solutions!",
            "Welcome to {bahra}Bahra Electric, where {innovation}innovation meets absolute {safety}safety.",
        ]),
        (12.0, 12.9, [
            "From top-tier {wires}Wires and Cables to heavy-duty {transformers}Transformers and {busbars}Busbars,",
            "we {deliver}deliver unmatched electrical {performance}performance for every {project}project.",
        ]),
        (28.0, 28.9, [
            "We build the backbone of {safety3}safety!",
            "Discover our reliable {grounding}grounding systems, {lightning}lightning protection, "
            "{cable}cable management, and durable {distribution}distribution boards.",
        ]),
        (45.0, 46.0, [
            "From {switches}switches and sockets to complete {industrial}industrial setups,",
            ("Bahra Electric is your {trusted}trusted partner for power.", 50.0),
            "{choose}Choose quality, choose {bahra_last}Bahra!",
        ]),
    ],
    # Modern Standard Arabic, fully vowelled with pausal endings before each pause.
    "ar": [
        (0.0, 1.2, [
            "هَذَا {sparky}سْبَارْكِي، دَلِيلُكَ لِأَفْضَلِ الحُلُولِ الكَهْرَبَائِيَّةْ!",
            "مَرْحَبًا بِكَ فِي {bahra}بَحْرَة إِلِكْتْرِيكْ، حَيْثُ يَلْتَقِي {innovation}الاِبْتِكَارُ {safety}بِالأَمَانِ التَّامّ.",
        ]),
        (12.0, 12.9, [
            "مِنَ {wires}الأَسْلَاكِ وَالكَابْلَاتِ المُمْتَازَةْ، إِلَى {transformers}المُحَوِّلَاتِ القَوِيَّةِ "
            "{busbars}وَقُضْبَانِ التَّوْصِيلْ،",
            "{deliver}نُقَدِّمُ {performance}أَدَاءً كَهْرَبَائِيًّا لَا مَثِيلَ لَهُ فِي كُلِّ {project}مَشْرُوعْ.",
        ]),
        (28.0, 28.9, [
            "نَحْنُ نَبْنِي أَسَاسَ {safety3}الأَمَانْ!",
            "اِكْتَشِفْ أَنْظِمَةَ {grounding}التَّأْرِيضِ المَوْثُوقَةْ، {lightning}وَالحِمَايَةَ مِنَ الصَّوَاعِقْ، "
            "{cable}وَتَنْظِيمَ الكَابْلَاتْ، {distribution}وَلَوْحَاتِ التَّوْزِيعِ المَتِينَةْ.",
        ]),
        (45.0, 45.6, [
            "مِنَ {switches}المَفَاتِيحِ وَالمَقَابِسْ، إِلَى التَّجْهِيزَاتِ {industrial}الصِّنَاعِيَّةْ،",
            ("بَحْرَة إِلِكْتْرِيكْ {trusted}شَرِيكُكَ المَوْثُوقُ فِي عَالَمِ الطَّاقَةْ.", 50.0),
            "{choose}اِخْتَرِ الجَوْدَةْ، اِخْتَرْ {bahra_last}بحرة!~بَحْرَهْ!",
        ]),
    ],
    # Saudi dialect, fully vowelled so the phonemizer reads it the way it is spoken.
    "ar-sa": [
        (0.0, 1.3, [
            "هَذَا {sparky}سْبَارْكِي، دَلِيلَكْ لِأَقْوَى الحُلُولْ الكَهْرَبَائِيَّةْ!",
            "حَيَّاكْ الله فِي {bahra}بَحْرَة إِلِكْتْرِيكْ، هِنَا يِلْتِقِي {innovation}الاِبْتِكَارْ مَعَ {safety}الأَمَانْ التَّامّ.",
        ]),
        (12.0, 12.9, [
            "عِنْدَنَا {wires}أَسْلَاكْ وَكَابْلَاتْ مِنْ أَعْلَى مُسْتَوَى، {transformers}وَمُحَوِّلَاتْ "
            "{busbars}وَقُضْبَانْ تَوْصِيلْ قَوِيَّةْ وَتِتْحَمَّلْ،",
            "{deliver}وَنِضْمَنْ لَكْ {performance}أَدَاءْ كَهْرَبَائِي مَا لَهْ مَثِيلْ فِي كُلّ {project}مَشْرُوعْ.",
        ]),
        (28.0, 28.9, [
            "إِحْنَا نِبْنِي أَسَاسْ {safety3}الأَمَانْ!",
            "تَعَرَّفْ عَلَى أَنْظِمَةْ {grounding}التَّأْرِيضْ المَوْثُوقَةْ، {lightning}وَالحِمَايَةْ مِنْ الصَّوَاعِقْ، "
            "{cable}وَتَنْظِيمْ الكَابْلَاتْ، {distribution}وَلَوْحَاتْ التَّوْزِيعْ اللِّي تْعِيشْ مَعَكْ.",
        ]),
        (45.0, 45.6, [
            "مِنْ {switches}الأَفْيَاشْ وَالمَفَاتِيحْ، لِينْ التَّجْهِيزَاتْ {industrial}الصِّنَاعِيَّةْ،",
            ("بَحْرَة إِلِكْتْرِيكْ {trusted}شَرِيكَكْ اللِّي تِعْتِمِدْ عَلِيهْ فِي الكَهْرَبَاءْ.", 50.0),
            "{choose}اِخْتَارْ الجَوْدَةْ، اِخْتَارْ {bahra_last}بحرة!~بَحْرَهْ!",
        ]),
    ],
}

HARAKAT = re.compile(r"[ً-ْٰـ]")
CUE = re.compile(r"\{(\w+)\}")


class KokoroVoice:
    def __init__(self, voice, speed):
        from kokoro_onnx import Kokoro
        d = os.environ.get("KOKORO_DIR", os.path.join(ROOT, "models"))
        self.k = Kokoro(os.path.join(d, "kokoro-v1.0.onnx"), os.path.join(d, "voices-v1.0.bin"))
        self.voice, self.speed, self.name = voice or "af_heart", speed or 0.94, "kokoro"

    def say(self, text):
        samples, sr = self.k.create(text, voice=self.voice, speed=self.speed, lang="en-us")
        return np.asarray(samples, dtype=np.float32), sr


class PiperArabicVoice:
    """Piper ar_JO-kareem through sherpa-onnx (espeak-ng phonemes, honours harakat)."""

    def __init__(self, voice, speed, default_speed=1.0):
        import sherpa_onnx
        d = os.environ.get("PIPER_AR_DIR", os.path.join(ROOT, "models", "vits-piper-ar_JO-kareem-medium"))
        cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=os.path.join(d, "ar_JO-kareem-medium.onnx"), tokens=os.path.join(d, "tokens.txt"),
                data_dir=os.path.join(d, "espeak-ng-data"), noise_scale_w=0.6),
            num_threads=4))
        self.tts, self.speed, self.voice, self.name = sherpa_onnx.OfflineTts(cfg), speed or default_speed, "ar_JO-kareem", "piper"

    def say(self, text):
        a = self.tts.generate(text, sid=0, speed=self.speed)
        return np.asarray(a.samples, dtype=np.float32), a.sample_rate


def trim(samples, sr, thresh=0.004):
    """Strip leading/trailing near-silence so sentence timings are tight."""
    idx = np.where(np.abs(samples) > thresh)[0]
    if len(idx) == 0:
        return samples
    pad = int(0.03 * sr)
    return samples[max(0, idx[0] - pad): idx[-1] + pad]


def parse(raw):
    """Split a script line into the text to speak, caption words and cue indexes."""
    cues, shown, spoken = {}, [], []
    for i, tok in enumerate(raw.split()):
        m = CUE.search(tok)
        if m:
            cues[m.group(1)] = i
        tok = CUE.sub("", tok)
        a, _, b = tok.partition("~")
        shown.append(a)
        spoken.append(b or a)
    return " ".join(spoken), shown, cues


def word_times(words, start, dur):
    """Spread words over the sentence proportionally to their length."""
    clean = [HARAKAT.sub("", w) for w in words]
    # letters + a little per word, plus extra for the pause after a comma
    weights = [len(re.sub(r"[^\w]", "", w)) + 1.6 + (2.5 if re.search(r"[,،]$", w) else 0) for w in clean]
    total = sum(weights)
    t, out = start, []
    for w, wt in zip(clean, weights):
        d = dur * wt / total
        out.append({"w": w, "t": round(t, 3), "d": round(d, 3)})
        t += d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="en", choices=sorted(SCRIPTS))
    ap.add_argument("--voice")
    ap.add_argument("--speed", type=float)
    args = ap.parse_args()

    if args.lang.startswith("ar"):
        # the dialect script is longer, so it is read a little faster to fit the scenes
        tts = PiperArabicVoice(args.voice, args.speed, 1.15 if args.lang == "ar-sa" else 1.1)
    else:
        tts = KokoroVoice(args.voice, args.speed)
    scenes_def = SCRIPTS[args.lang]

    os.makedirs(BUILD, exist_ok=True)
    clips, timeline = [], {"lang": args.lang, "voice": tts.voice, "scenes": [], "cues": {}}

    for i, (scene_start, vo_start, sentences) in enumerate(scenes_def):
        next_start = scenes_def[i + 1][0] if i + 1 < len(scenes_def) else TOTAL
        t = vo_start
        scene = {"start": scene_start, "sentences": []}
        for entry in sentences:
            raw, earliest = entry if isinstance(entry, tuple) else (entry, 0.0)
            t = max(t, earliest)
            text, words, cues = parse(raw)
            samples, sr = tts.say(text)
            samples = trim(samples, sr)
            dur = len(samples) / sr
            clips.append((t, samples, sr))
            timed = word_times(words, t, dur)
            for name, idx in cues.items():
                timeline["cues"][name] = timed[idx]["t"]
            caption = HARAKAT.sub("", " ".join(words))
            scene["sentences"].append({"text": caption, "start": round(t, 3),
                                       "dur": round(dur, 3), "words": timed})
            print(f"scene {i + 1}: {t:6.2f}s +{dur:5.2f}s  {caption}")
            t += dur + GAP
        if t - GAP > next_start - 0.15:  # may run into the wipe, never past the cut
            raise SystemExit(f"scene {i + 1} voiceover overruns into next scene ({t - GAP:.2f}s)")
        timeline["scenes"].append(scene)

    expected = {n for _, _, ss in SCRIPTS["en"] for s in ss for n in CUE.findall(s if isinstance(s, str) else s[0])}
    missing = expected - set(timeline["cues"])
    if missing:
        raise SystemExit(f"script is missing cues: {sorted(missing)}")

    sr = clips[0][2]
    track = np.zeros(int(TOTAL * sr), dtype=np.float32)
    for t, samples, _ in clips:
        a = int(t * sr)
        track[a:a + len(samples)] += samples[: len(track) - a]
    track = track / np.max(np.abs(track)) * 0.89
    sf.write(os.path.join(BUILD, "voiceover.wav"), track, sr)
    with open(os.path.join(BUILD, "timeline.json"), "w") as f:
        json.dump(timeline, f, indent=1, ensure_ascii=False)
    # index.html is opened from file://, so it reads the timeline as a script
    with open(os.path.join(BUILD, "timeline.js"), "w") as f:
        f.write("window.TIMELINE = " + json.dumps(timeline, ensure_ascii=False) + ";\n")
    print("wrote build/voiceover.wav, build/timeline.json and build/timeline.js")


if __name__ == "__main__":
    main()
