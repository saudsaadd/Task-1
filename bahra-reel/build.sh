#!/usr/bin/env bash
# Rebuild output/bahra_electric_reel.mp4 from scratch.
#   ./build.sh                      default voice (af_heart)
#   VOICE=am_michael ./build.sh     any Kokoro voice id
set -euo pipefail
cd "$(dirname "$0")"

MODELS=${KOKORO_DIR:-models}
REL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$MODELS" build output
[ -f "$MODELS/kokoro-v1.0.onnx" ] || curl -L -o "$MODELS/kokoro-v1.0.onnx" "$REL/kokoro-v1.0.onnx"
[ -f "$MODELS/voices-v1.0.bin" ] || curl -L -o "$MODELS/voices-v1.0.bin" "$REL/voices-v1.0.bin"

KOKORO_DIR="$MODELS" python3 scripts/voiceover.py --voice "${VOICE:-af_heart}"
rm -rf build/frames
node scripts/render.mjs --workers "${WORKERS:-4}"
python3 scripts/audio.py
ffmpeg -y -loglevel error -framerate 30 -i build/frames/%05d.jpg -i build/mix.wav \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest output/bahra_electric_reel.mp4
ffmpeg -y -loglevel error -ss 56 -i output/bahra_electric_reel.mp4 -frames:v 1 output/cover.jpg
echo "done: output/bahra_electric_reel.mp4"
