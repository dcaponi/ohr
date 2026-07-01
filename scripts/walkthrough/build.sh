#!/usr/bin/env bash
# Build the narrated walkthrough video:
#   OpenAI TTS narration  ->  Playwright screen recording  ->  ffmpeg mux
#
# Requires: OPENAI_API_KEY in .env, ffmpeg/ffprobe, Playwright chromium
# (`npx playwright install chromium`), and the app running at BASE_URL with the
# corpus indexed and evals seeded + run.
#
# Usage:  BASE_URL=http://localhost:3000 ./scripts/walkthrough/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE="${BASE_URL:-http://localhost:3000}"
WT="$(mktemp -d)"
echo "work dir: $WT"

# 1. Narration audio (one mp3 per scene) + durations.
npx tsx scripts/walkthrough/build-audio.ts "$WT"

# 2. Screen recording, timed to the narration durations.
npx tsx scripts/walkthrough/record.ts "$WT" "$BASE"

# 3. Concatenate narration in scene order.
WT="$WT" node -e "const s=require('./scripts/walkthrough/scenes.json');const p=process.env.WT+'/audio/';console.log(s.map(x=>\`file '\${p}\${x.id}.mp3'\`).join('\n'))" > "$WT/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WT/list.txt" -c copy "$WT/narration.mp3"

# 4. Mux: cover the dev badge corner, encode web-friendly H.264 + AAC.
mkdir -p media
ffmpeg -y -loglevel error -i "$WT/screen.webm" -i "$WT/narration.mp3" \
  -filter:v "drawbox=x=6:y=734:w=64:h=60:color=0x0f1115:t=fill" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 128k -shortest media/walkthrough.mp4

# 5. Poster frame.
ffmpeg -y -loglevel error -ss 50 -i media/walkthrough.mp4 -frames:v 1 -q:v 3 media/walkthrough-poster.jpg

echo "✓ media/walkthrough.mp4"
