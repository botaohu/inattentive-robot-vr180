#!/usr/bin/env bash
# Packs color + depth into a single side-by-side frame:
#   [ color 1920x1920 | grayscale inverse-depth 1920x1920 ]  → <id>.vr180d.mp4
# Keeps the color clip's audio. Usage: tools/pack-depth.sh <color.mp4> <depth.mp4> <out.mp4>
set -euo pipefail
color="$1"; depth="$2"; out="$3"
ffmpeg -v error -y -i "$color" -i "$depth" \
  -filter_complex "[1:v]scale=1920:1920,format=gray,format=yuv420p[d];[0:v][d]hstack=inputs=2[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -c:a copy \
  -movflags +faststart "$out"
echo "packed → $out"
