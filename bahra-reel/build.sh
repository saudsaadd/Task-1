#!/usr/bin/env bash
# Rebuild the reel from scratch.
#   ./build.sh                       English  -> output/bahra_electric_reel.mp4    (Kokoro, af_heart)
#   REEL_LANG=ar ./build.sh          Fusha    -> output/bahra_electric_reel_ar.mp4 (Piper, ar_JO-kareem)
#   REEL_LANG=ar-sa ./build.sh       Saudi    -> output/bahra_electric_reel_sa.mp4 (same voice)
#   VOICE=am_michael ./build.sh      any Kokoro voice id for the English version
set -euo pipefail
cd "$(dirname "$0")"

REEL_LANG=${REEL_LANG:-en}
REL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p models build output
if [ "$REEL_LANG" = en ]; then
  export KOKORO_DIR=${KOKORO_DIR:-models}
  [ -f "$KOKORO_DIR/kokoro-v1.0.onnx" ] || curl -L -o "$KOKORO_DIR/kokoro-v1.0.onnx" "$REL/kokoro-v1.0.onnx"
  [ -f "$KOKORO_DIR/voices-v1.0.bin" ] || curl -L -o "$KOKORO_DIR/voices-v1.0.bin" "$REL/voices-v1.0.bin"
  python3 scripts/voiceover.py --lang en --voice "${VOICE:-af_heart}"
  OUT=output/bahra_electric_reel
else
  export PIPER_AR_DIR=${PIPER_AR_DIR:-models/vits-piper-ar_JO-kareem-medium}
  if [ ! -d "$PIPER_AR_DIR" ]; then
    curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-kareem-medium.tar.bz2 \
      | tar xj -C models
  fi
  python3 scripts/voiceover.py --lang "$REEL_LANG"
  OUT=output/bahra_electric_reel_${REEL_LANG#ar-}
fi

rm -rf build/frames
node scripts/render.mjs --workers "${WORKERS:-4}"
python3 scripts/audio.py
ffmpeg -y -loglevel error -framerate 30 -i build/frames/%05d.jpg -i build/mix.wav \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$OUT.mp4"
echo "done: $OUT.mp4"
