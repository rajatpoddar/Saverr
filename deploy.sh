#!/usr/bin/env bash
# SaverR — NAS deploy script
# Ye script NAS pe chalega (ya SSH se). Sirf "saverr" container ko touch karta hai.
# Flow: git pull → old container stop/rm → image build → run
#
# Usage (NAS pe):
#   cd /volume1/docker/saverr/app && ./deploy.sh
# Ya local se:
#   ./deploy.sh rajat@192.168.29.101
set -euo pipefail

APP_DIR="/volume1/docker/saverr/app"
DOCKER="/usr/local/bin/docker"
REMOTE="${1:-}"

# ---------- helper ----------
log() { echo "[$(date +%H:%M:%S)] $*"; }

# ---------- local se SSH wrapper mode ----------
if [ -n "$REMOTE" ]; then
  log "SSH mode: $REMOTE pe deploy.sh chala rahe hain..."
  exec ssh "$REMOTE" "cd $APP_DIR && sudo -n ./deploy.sh"
fi

# ---------- NAS-side checks ----------
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo -n"; fi
command -v "$DOCKER" >/dev/null 2>&1 || { echo "❌ docker nahi mila ($DOCKER)"; exit 1; }
[ -d "$APP_DIR" ] || { echo "❌ $APP_DIR nahi mila"; exit 1; }
cd "$APP_DIR"

# ---------- 1) git pull ----------
log "Git pull..."
if [ -d .git ]; then
  git fetch --all --quiet
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  git reset --hard "origin/$BRANCH" --quiet
  log "Code updated: branch=$BRANCH commit=$(git rev-parse --short HEAD)"
else
  echo "❌ $APP_DIR git repo nahi hai. Pehle clone karo:"
  echo "   sudo git clone <REPO_URL> $APP_DIR"
  exit 1
fi

# ---------- 2) old container stop ----------
if "$SUDO" "$DOCKER" ps --format '{{.Names}}' | grep -qx 'saverr'; then
  log "saverr container stop kar raha hoon..."
  "$SUDO" "$DOCKER" compose down --remove-orphans 2>/dev/null \
    || "$SUDO" "$DOCKER" rm -f saverr
else
  log "saverr running nahi tha (skip stop)"
fi

# ---------- 3) build ----------
log "Image build (2-5 min lag sakta hai)..."
"$SUDO" "$DOCKER" compose build --pull

# ---------- 4) run ----------
log "Container start..."
"$SUDO" "$DOCKER" compose up -d

# ---------- 5) verify ----------
log "Health check (20s wait)..."
sleep 20
if curl -sf -m 5 http://localhost:8508/api/health >/dev/null 2>&1; then
  log "✅ Deploy successful — http://$(hostname -I 2>/dev/null | awk '{print $1}'):8508"
else
  echo "❌ Health check fail! Logs:"
  "$SUDO" "$DOCKER" logs saverr --tail 30
  exit 1
fi
