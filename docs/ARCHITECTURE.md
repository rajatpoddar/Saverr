# SaverR — Architecture

> Single-container FastAPI app + vanilla JS PWA. No build step, no node_modules.

## High-level

```
PWA (static/, served by FastAPI)
   │  fetch /api/*
   ▼
FastAPI (backend/main.py, uvicorn :8000 → host :8508)
   ├── asyncio.Queue + 2 workers (main.py _worker)
   │      └── engine.run_download (backend/engine.py)
   │             ├── yt-dlp Python API (probe + download, asyncio.to_thread)
   │             └── ffmpeg (yt-dlp postprocessor: merge mp4 / extract mp3)
   ├── SQLite via aiosqlite (backend/database.py, /data/saverr.db)
   ├── Range streaming (main.py media_stream, 256KB chunks)
   └── StaticFiles mount "/" (static/) — LAST, /api/* pehle match hote hain
```

## Module Map

| File | Responsibility | Key functions |
|------|---------------|---------------|
| `backend/main.py` | FastAPI routes, queue workers, sync | `create_download`, `media_stream`, `sync_folders`, `_worker` |
| `backend/engine.py` | yt-dlp wrapper, jobs dict, formats | `run_download`, `probe`, `ProgressHook`, `CATEGORIES`, `JOBS` |
| `backend/database.py` | SQLite CRUD, stats | `add_media`, `list_media`, `find_by_url`, `stats`, `purge_missing` |
| `static/app.js` | PWA logic, polling, player | `startDownload`, `pollJobs`, `loadLibrary`, `openPlayer`, `renderGrid` |
| `static/index.html` | 3 views + player sheet + bottom nav | — |
| `static/style.css` | Design tokens (see docs/DESIGN.md) | — |
| `static/sw.js` | Service worker, network-first, API never cached | — |
| `run.sh` | Local dev launcher (venv, SSL fix, env vars) | — |
| `deploy.sh` | NAS deploy: git pull → stop → build → run | — |

## Data Flow: Download

```
UI POST /api/download {url, category, mode}
  → duplicate check (find_by_url) → job in engine.JOBS + asyncio.Queue
  → _worker picks job → engine.run_download
      → probe(url) [45s timeout] → title/duration/thumbnail
      → format: avc1+aac chain (mobile Safari compat!)
      → outtmpl: MEDIA_DIR/<category>/<title>_<rand>.%(ext)s
      → ProgressHook updates JOBS[job_id] (progress/speed/eta)
      → postprocess: ffmpeg merge (video→mp4) / extract (audio→mp3)
  → on done: dbm.add_media(...) → UI next poll shows it in Library
```

## Data Flow: Playback

```
UI openPlayer(media) → <video src="/api/media/{id}/stream">
  → media_stream() reads row → resolves MEDIA_DIR/<category>/<filename>
  → Range header? → 206 partial, 256KB chunks (seek works)
  → no Range? → FileResponse full
```

## Thumbnails

Instagram CDN hotlink-block karta hai → server-side proxy:
`GET /api/thumb/{id}` → DB se thumbnail URL → download → cache `/data/thumbs/<md5>.jpg`
→ FileResponse with 1-day cache headers. Failure pe 404 → UI fallback SVG icon.

## Sync (folder ↔ DB)

Startup + POST /api/sync: media root scan →
- Naye files (DB mein nahi) → add_media (title from filename, extractor="imported")
- DB rows jinki file gayab → purge_missing

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `MEDIA_DIR` | `/media` | Video/audio storage root (NAS: Jellyfin folder) |
| `DATA_DIR` | `/data` | SQLite DB, thumbs cache, cookies |
| `STATIC_DIR` | `/app/static` | Frontend files |
| `TUNNEL_URL` | — | Cloudflare tunnel public URL (optional) |
| `LAN_URL` | `http://192.168.29.101:8508` | LAN badge ke liye |

## Planned (v1.5 — not yet built)

- **Tags:** `tags` + `media_tags` tables (M2M). `engine.CATEGORIES` folder-level rahega;
  tags DB-level only. New endpoints: `/api/tags` CRUD, `/api/media/{id}/tags`.
- **Browse:** `GET /api/browse?path=` sandboxed tree walker for Jellyfin-style folder view.
- **Feed:** `/api/feed?tag=&category=` returns shuffled/recent items; UI scroll-snap fullscreen player.

## Ports & Paths (NAS)

- Host port **8508** → container 8000
- `/volume1/video/saverr` → `/media` (Jellyfin mount: `/volume1/video → /media`)
- `/volume1/docker/saverr/data` → `/data`
- Container user `1026:100` (Rajat:users)
