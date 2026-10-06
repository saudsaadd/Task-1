# Track One – Daily Tip (English version)

The original 10-second clip in Arabic is at `input/original_ar.mp4`. The English version is at **`output/bahra_track_one_en.mp4`** (1280×720, 24fps, same length).

## What changed (and nothing else)

| | Original | English |
|---|---|---|
| Voice | المسار الأول، صُمّم خصيصاً لزملائي موظفي مجموعة بحرة. بنتلاقى بشكل يومي عشان نتشارك معلومة يومية، نكسب منها مهارات فنية ومعلومات قيّمة تطوّر من كفاءتنا. | Track One, designed for my colleagues at Bahra Group. We'll meet every day to share a daily tip, gaining technical skills and know-how that boost our efficiency. |
| Title | المسار الأول - معلومة يومية | Track One – Daily Tip |

- **Picture:** the Arabic title is removed from every frame and replaced with the English one, using the same motion. It sits in front of the character's chin, rises past his face, settles behind the helmet, and fades out with the office background. Everything else (character, background, lightbulb, logos) is the original footage.
- **Sound:** the original voice is separated from the background music (UVR MDX-Net). The music stays as it is, and the English voice (Kokoro TTS, `am_michael`) is placed on the same time slots as the original speech, at the same level.

## Rebuilding

```bash
pip install numpy soundfile opencv-python-headless pillow onnxruntime kokoro-onnx
./build.sh            # downloads the models on first run
```

The scripts are in `scripts/`: `separate.py` (voice/music), `masks.py` + `segment.py` (character matte), `plate.py` (clean background + title tracking), `composite.py` (erasing the Arabic and drawing the English), `voiceover.py` (English voice), and `mix.py` (mix).
