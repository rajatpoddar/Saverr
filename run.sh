#!/usr/bin/env bash
# SaverR — local run script (macOS/Linux)
# Usage: ./run.sh          → http://localhost:8508
#        ./run.sh 8080     → alag port pe
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8508}"
DATA_DIR="$PWD/local-data"
MEDIA_DIR="$PWD/local-media"

# ffmpeg (audio mode ke liye) — common install paths
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# ---- venv setup (first run pe) ----
if [ ! -x .venv/bin/python ]; then
  echo "📦 venv nahi mila, bana raha hoon (pehli baar ~1 min)..."
  python3.12 -m venv .venv 2>/dev/null || python3 -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
fi

# macOS Python SSL fix — venv Python ko certifi CA bundle point karo
# (wrna yt-dlp ko "CERTIFICATE_VERIFY_FAILED" aata hai)
CERTIFI_CA="$(./.venv/bin/python -m certifi 2>/dev/null || true)"
if [ -z "$CERTIFI_CA" ]; then
  ./.venv/bin/pip install -q certifi
  CERTIFI_CA="$(./.venv/bin/python -m certifi)"
fi
export SSL_CERT_FILE="$CERTIFI_CA"

# ---- dirs ----
mkdir -p "$DATA_DIR" "$MEDIA_DIR"

# ---- ffmpeg check (sirf warning, video mode phir bhi chalega) ----
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "⚠️  ffmpeg nahi mila — audio/MP3 mode fail hoga. Install: brew install ffmpeg"
fi

# ---- port already in use? ----
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ Port $PORT pehle se use mein hai. Koi aur port do: ./run.sh 8509"
  exit 1
fi

echo ""
echo "🚀 SaverR chal raha hai:  http://localhost:$PORT"
echo "   API docs:              http://localhost:$PORT/api/docs"
echo "   Media folder:          $MEDIA_DIR"
echo "   Band karne ke liye:    Ctrl+C"
echo ""

# backend in env vars padhta hai
export STATIC_DIR="$PWD/static"
export MEDIA_DIR
export DATA_DIR

cd backend
exec ../.venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --no-server-header
