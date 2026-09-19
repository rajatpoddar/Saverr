# 📥 SaverR — Media Saver for Synology NAS

> Paste any public **YouTube Shorts / Instagram Reels** link → saved on NAS → watch anywhere (web + Jellyfin + mobile offline).

**Server:** `rajat@192.168.29.101` — Synology RS3617xs+ (DSM 7.3.1, Docker 24.0.2, 12GB RAM, 1.4TB free)
**Status:** Code complete + locally verified · NAS deploy **paused — user approval pending** (build was running, stopped intentionally)

---

## 0. Local Run (macOS) — sabse pehle ye karo

```bash
cd ~/Documents/Projects/ytdl

# 1. venv ready hai (.venv), install agar nahi:
./.venv/bin/pip install -r requirements.txt

# 2. ffmpeg PATH mein hai (~/.local/bin) — audio mode ke liye chahiye
export PATH="$HOME/.local/bin:$PATH"

# 3. Local dirs + server start
mkdir -p /tmp/saverr-media /tmp/saverr-data
cd backend
STATIC_DIR=$PWD/../static \
MEDIA_DIR=/tmp/saverr-media \
DATA_DIR=/tmp/saverr-data \
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8508
```

Browser: **http://localhost:8508** · API docs: **http://localhost:8508/api/docs**

Test download: koi public YouTube Shorts link paste karo → Download → Downloads card mein progress dikhega → Library mein tile → tap karke player.

> Note: Local test mein NAS wale volumes nahi hain, isliye `MEDIA_DIR`/`DATA_DIR` env vars `/tmp` pe point karte hain. Docker mein ye containers ke andar `/media` aur `/data` honge.

---

## 1. Current Status

| Step | Task | Status |
|------|------|--------|
| 1 | Server recon (SSH, Docker, ports, disk, Jellyfin mount check) | ✅ |
| 2 | Requirements confirm (storage, access, 15 categories) | ✅ |
| 3 | PLAN.md v1 | ✅ |
| 4 | Backend (FastAPI + yt-dlp + queue + SQLite) | ✅ |
| 5 | Frontend PWA (skills se design system apply kiya) | ✅ |
| 6 | Dockerfile + docker-compose.yml | ✅ |
| 7 | Local syntax + import test | ✅ |
| 8 | **Local live test (uvicorn + real download)** | ⬜ **AGLA STEP** |
| 9 | NAS deploy — **PAUSED, aapke approval ke bina nahi chalega** | ⏸️ |
| 10 | E2E: YouTube Shorts + Instagram Reels + audio mode | ⬜ |

NAS pe abhi ka status: folders (`/volume1/docker/saverr/data`, `/volume1/video/saverr`) ban chuke hain, code rsync ho chuka hai `/volume1/docker/saverr/app/`, ek docker build background mein ruki hai (koi container abhi tak start NAHI hua).

---

## 2. Architecture

```
iPhone/Android (PWA) ──> LAN :8508 ya Cloudflare Tunnel
                              │
┌─────────────────────────────▼──────────────────────────┐
│ Docker container "saverr" (port 8508→8000)             │
│  FastAPI                                               │
│   • POST /api/download {url, category, mode}           │
│   • GET  /api/jobs (progress polling)                  │
│   • GET  /api/media (list+filter+search)               │
│   • GET  /api/media/{id}/stream (HTTP Range seek)      │
│   • GET  /api/media/{id}/file (offline download)       │
│   • GET  /api/thumb/{id} (server-side thumb proxy)     │
│   • GET  /api/stats, /api/categories, /api/config      │
│   • DELETE /api/media/{id}, POST /api/sync             │
│  yt-dlp subprocess + ffmpeg (merge/MP3)                │
│  SQLite (/data/saverr.db)                              │
│ Volumes: /volume1/video/saverr → /media (Jellyfin ✅)  │
│          /volume1/docker/saverr/data → /data           │
└────────────────────────────────────────────────────────┘
```

---

## 3. Port & Path Planning

Existing busy ports (verified): 3001, 3002, 3040, 3210, 4123, 4321, 4433, 4991, 5005, 5007, 5433, 5436, 5678, 6380, 8080-8091, 8096, 8123, 8192, 8420, 8446, 8500, 8502, 8504-8507, 8555, 8580, 8642, 8765, 8880, 9002, 9119, 9443, 9876, 9900, 9901, 11434, ...

| Item | Value |
|------|-------|
| **Port** | `8508` ✅ free |
| **Container** | `saverr` (user 1026:100 — files aapke naam se) |
| **Code on NAS** | `/volume1/docker/saverr/app/` |
| **DB/cookies/thumbs** | `/volume1/docker/saverr/data/` |
| **Media** | `/volume1/video/saverr/<Category>/` — Jellyfin ka mount `/volume1/video → /media` hai, toh Jellyfin mein `saverr` folder dikhega |

---

## 4. Design System (ui-ux-pro-max + frontend-design skills se)

| Token | Value | Source |
|-------|-------|--------|
| Style | Minimalism/Swiss — clean, functional, grid-based | skill DB match |
| Background | `#0f172a` (slate-900) | skill dark palette |
| Card | `#111827` · Muted surface `#1e293b` · Border `#334155` | skill |
| Text | `#f8fafc` · Secondary `#cbd5e1` · Faint `#94a3b8` | skill |
| Accent | `#dc2626` (red-600) — primary CTA, active chips | skill |
| Fonts | Inter (UI) + JetBrains Mono (URLs, numbers, meta) | skill pairing |
| Icons | Inline SVG (Lucide set) — **no emoji as icons** | skill checklist |
| Motion | 150-300ms transitions, respect `prefers-reduced-motion` | skill |
| A11y | `:focus-visible` rings, 44px+ touch targets, `aria-live` status msg | skill priority 1-2 |

---

## 5. Features

### Backend
- POST /api/download — yt-dlp native downloader, progress hooks, duplicate check (same URL+mode)
- Max 2 parallel downloads, baaki queued (in-memory asyncio queue)
- Video: bestvideo+bestaudio → mp4 merge (ffmpeg) · Audio: bestaudio → mp3 192k
- Instagram/YouTube cookies support: `/data/<site>_cookies.txt` (private reels ke liye)
- Filename: sanitized title + random suffix, `restrictfilenames`
- Range-based streaming (mobile seek), Content-Disposition download endpoint
- Thumbnail proxy (Instagram CDN hotlink block bypass) + disk cache
- Folder↔DB sync on startup (manually deleted/added files handle)
- 45s probe timeout, 1h download timeout, retries=3

### Frontend PWA
- 3 views: Add / Library / Stats — bottom nav, mobile-first
- 15 category chips + video/audio toggle
- Live job cards: progress %, speed, ETA, error display
- Library: lazy thumbnails, category filter, search, tap → player sheet
- Player: inline video/audio with seek, "Save offline" (browser download), delete
- LAN/Cloud auto-detect badge
- PWA: manifest + service worker (API never cached) + iOS/Android install

### v2 ideas (not built)
- Auth token for tunnel access · Category CRUD UI · Bulk/playlist download · Jellyfin scan trigger

---

## 6. NAS Deploy (jab aap approval doge)

```bash
# 1. Code sync
rsync -av --exclude '.venv' --exclude '.git' --exclude '__pycache__' \
  --exclude 'scripts' --exclude '.DS_Store' --exclude 'PLAN.md' \
  ~/Documents/Projects/ytdl/ rajat@192.168.29.101:/volume1/docker/saverr/app/

# 2. Build + start
ssh rajat@192.168.29.101 'cd /volume1/docker/saverr/app && \
  sudo -n /usr/local/bin/docker compose up -d --build'

# 3. Verify
ssh rajat@192.168.29.101 'sudo -n /usr/local/bin/docker logs saverr --tail 20'
curl http://192.168.29.101:8508/api/health
```

Rollback: `sudo docker compose down` — kuch bhi existing touch nahi hua tha.

**Tunnel setup (aap manually karoge):** Cloudflare dashboard → add public hostname → service `http://192.168.29.101:8508` → phir `/data/tunnel_url.txt` mein URL likh dena (ya compose mein `TUNNEL_URL` env).

---

## 7. Safety Notes

- Naye folders only: `/volume1/docker/saverr/`, `/volume1/video/saverr/` — baaki sab read-only dekha
- Koi existing container/service/config touch nahi kiya
- Port 8508 pehle verify kiya (free tha)
- Container limits: 1GB RAM, 1.5 CPU — production apps pe load nahi
- Personal use ke liye bana hai — public content only
