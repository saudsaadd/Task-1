# Bahra Electric – Reel (60s, 9:16)

| Version | File |
|---|---|
| English | **`output/bahra_electric_reel.mp4`** |
| Modern Standard Arabic / Fusha (voiceover + Arabic captions) | **`output/bahra_electric_reel_ar.mp4`** |
| Saudi dialect (voiceover + Arabic captions) | `output/bahra_electric_reel_sa.mp4` |

Both are 1080×1920, 30fps, H.264 + AAC, ~12.5 MB. The visuals, character and on-screen text are identical; only the voiceover and the bottom captions differ. The cover image is at `output/cover.jpg`.

## Scenes

| Time | Scene | On-screen text |
|---|---|---|
| 0:00–0:12 | Sparky in a smart city: waves, "Hi, I'm Sparky!" bubble, Innovation / Safety badges | Powering the Future Safely! |
| 0:12–0:28 | Product cards: Wires & Cables, Transformers, Busbars (Copper & Aluminium) + Quality Guaranteed seal | High-Quality Wires, Cables & Transformers |
| 0:28–0:45 | Building with lightning protection and grounding (lightning strike that runs safely to earth) + Cable Trays, Conduits, Distribution Boards, Service Boxes tiles | Advanced Protection & Infrastructure Systems |
| 0:45–1:00 | Sparky flips a modern switch and the lights come on, then the large logo + Contact Us Today | Bahra Electric – Trusted Quality |

The English voiceover follows the script word for word, with timed captions at the bottom of the frame (for muted viewing).

## How it's made

- `index.html` + `js/main.js`: all scenes drawn as SVG and animated with a GSAP timeline that can be seeked to any frame.
- `js/character.js`: Sparky redrawn as vector art from the character sheet in `assets/reference/`, with separate joints (arms, forearm, hands, blinking).
- `scripts/voiceover.py`: the voiceover script for both languages. Each `{cue}` marker before a word times an animation (e.g. a product card appears when its name is spoken). English uses Kokoro TTS; Arabic (Fusha `ar` and Saudi `ar-sa`) uses the Piper `ar_JO-kareem` voice via sherpa-onnx, with fully vowelled text for clear pronunciation.
- `scripts/render.mjs`: renders the frames with headless Chromium (Playwright).
- `scripts/audio.py`: background music and sound effects synthesised in code (royalty-free), with the music ducked under the voice.

## Rebuilding

```bash
npm install                      # gsap + playwright
pip install -r requirements.txt  # kokoro-onnx, soundfile, numpy
./build.sh                       # downloads the voice model on first run, then builds the video
VOICE=am_michael ./build.sh      # same video with a male voice
REEL_LANG=ar ./build.sh          # Fusha Arabic version
REEL_LANG=ar-sa ./build.sh       # Saudi version
```

To change any text, edit `index.html`; to change the voiceover script, edit `SCRIPTS` in `scripts/voiceover.py`. Then run `./build.sh` again.
