#!/usr/bin/env bash
# English version of the "Track One – Daily Tip" clip.
#   ./build.sh [input.mp4]   -> output/bahra_track_one_en.mp4
# Steps: split voice/music, matte the character, erase the Arabic title, draw the
# English title with the same motion, voice the English script on the original
# speech slots, mix it over the original music bed.
set -euo pipefail
cd "$(dirname "$0")"
SRC=${1:-input/original_ar.mp4}
M=${MODELS:-models}
mkdir -p "$M" build/f build/mask build/out output

get() { [ -f "$M/$2" ] || curl -L -o "$M/$2" "$1/$2"; }
get https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0 kokoro-v1.0.onnx
get https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0 voices-v1.0.bin
get https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models Kim_Vocal_2.onnx
get https://github.com/danielgatis/rembg/releases/download/v0.0.0 isnet-general-use.onnx
get https://github.com/danielgatis/rembg/releases/download/v0.0.0 u2net_human_seg.onnx

cp "$SRC" build/original.mp4
ffmpeg -y -loglevel error -i build/original.mp4 build/f/%03d.png
python3 scripts/separate.py build/original.mp4 build/sep_kim "$M/Kim_Vocal_2.onnx" 7680 vocals
SEG_DIR="$M" python3 scripts/masks.py 1 172
python3 scripts/plate.py
python3 scripts/composite.py
KOKORO_DIR="$M" python3 scripts/voiceover.py
python3 scripts/mix.py
ffmpeg -y -loglevel error -framerate 24 -i build/out/%03d.png -i build/mix_en.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -r 24 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest output/bahra_track_one_en.mp4
echo "done: output/bahra_track_one_en.mp4"
