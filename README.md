# 📥 SaverR

> Paste any public **YouTube Shorts / Instagram Reels** link → saved on your Synology NAS →
> watch anywhere: web PWA, Jellyfin, ya mobile offline.

Personal, self-hosted media saver. Single Docker container, no build step, mobile-first PWA.

## Quick Start (local dev)

```bash
./run.sh          # → http://localhost:8508
./run.sh 8090     # alag port
```

First run pe venv + dependencies auto-install ho jaate hain.
macOS SSL fix (certifi) bhi script handle karta hai.

## Features

- **Download**: YouTube Shorts, Instagram Reels, + yt-dlp ke 1700+ sites
- **Video (h264/aac — mobile-compatible) ya Audio (MP3)**
- **Personal Music Player** — mood playlists (80s, 90s, party, focus…), mini player + Now Playing
- **Reels Feed** — Instagram-jaisi full-screen swipe, autoplay
- **Movies** — Netflix-jaisa browse + MX-player controls
- **Tag hierarchy** — songs → moods sub-tags; har item multi-tag; tag manager UI
- **Categories** (15) — files category folders mein, Jellyfin mein auto-dikhta hai
- **Live progress** — %, speed, ETA; 2 parallel downloads
- **Library** — thumbnails, tag filter, search, seek-able streaming
- **Offline save** — browser download button se phone mein save
- **PWA** — iPhone/Android pe "Add to Home Screen" → full-screen app
- **LAN + Cloudflare Tunnel** auto-detect

**Roadmap:** progress bar overhaul (phases) · torrent support (qBittorrent sidecar) · Jellyfin folder browser — [docs/TASKS.md](docs/TASKS.md)

## Stack

FastAPI · yt-dlp · SQLite · Vanilla JS PWA · Docker

## Docs

| Doc | Kya hai |
|-----|---------|
| [docs/PRD.md](docs/PRD.md) | Product requirements (v1 done, v1.5 in progress) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, data flows, env vars |
| [docs/RULES.md](docs/RULES.md) | Coding + NAS safety rules (agents read this) |
| [docs/DESIGN.md](docs/DESIGN.md) | Design tokens & components |
| [docs/TASKS.md](docs/TASKS.md) | Task breakdown by phase |
| [docs/MEMORY.md](docs/MEMORY.md) | Decisions, gotchas, user preferences |
| [PLAN.md](PLAN.md) | Original v1 plan (historical) |

## Deploy (NAS)

```bash
./deploy.sh       # git pull → stop saverr → build → run
```

⚠️ Sirf `saverr` container ko touch karta hai — baaki NAS untouched.
Pehli baar manually setup: [docs/PRD.md](docs/PRD.md) §6 dekho.

## Private Instagram Reels

Follow-only reels ke liye: `instagram_cookies.txt` (Netscape format) ko
`DATA_DIR` mein daalo. Docker pe: `/volume1/docker/saverr/data/`.

## Legal

Personal use only. Public content. DRM bypass nahi karta. Copyright ka respect karo.
