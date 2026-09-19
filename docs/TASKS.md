# SaverR — Tasks (v1.7)

> Order: pehle simple features, phir complex views. PRD R-numbers se mapped.
> PLAN.md root se hata diya gaya — v1 planning history ab PRD + MEMORY me merged.

## Phase 0 — Repo & Setup
- [x] git init, remote add origin https://github.com/rajatpoddar/Saverr.git
- [x] First push (code + docs + scripts)
- [x] .gitignore verify (venv, local-data, cookies out)
- [x] PLAN.md hatao (docs/PRD.md ab source of truth)

## Phase 1 — Simple Wins (pehle ye)
- [x] Mobile codec fix (avc1 chain) — engine.py
- [x] deploy.sh, run.sh, SSL certifi fix
- [x] Probe endpoint: `GET /api/probe?url=` — title/thumbnail/duration (preview ke liye)
- [x] Paste → preview card UI (thumbnail + title + duration)
- [x] Audio/Video select buttons preview card pe (R6)

## Phase 2 — Tags with Hierarchy (R1 + R7) — CORE
- [x] DB migration: `tags(id, name, parent_id, kind, created_at)` + `media_tags(media_id, tag_id)`
- [x] Seed tags: podcast, songs → (80s, 90s, 00s, party, romantic, focus, sad, sleep, relax, feel-good, work-out) + video: reels, music-videos, movies
- [x] database.py: tag CRUD + `resolve_tag_ids_with_descendants`
- [x] API: `GET/POST /api/tags`, `PATCH/DELETE /api/tags/{id}`, `POST /api/media/{id}/tags`
- [x] Download flow me tags save karna (job payload → media_tags)
- [x] Tag manage UI: library header se — add (parent select + kind), rename, delete

## Phase 3 — Music View (R8)
- [x] `GET /api/media?kind=audio&tag=` filter (tag descendants included)
- [x] Music tab UI: playlist chips (podcast/songs/moods), song list
- [x] **Mini player bar** (global): current track, play/pause, next
- [x] **Now Playing sheet**: big art, seek slider, prev/next, auto-advance queue
- [x] Audio state module (app.js): queue, currentIndex, single global <audio>

## Phase 4 — Reels View (R3 + R9)
- [x] Full-screen snap-scroll container (100dvh slides)
- [x] IntersectionObserver autoplay/pause
- [x] Mute toggle, tap play/pause, overlay meta + tags
- [x] Filter: reels tag / all video shorts

## Phase 5 — Movies View (R10)
- [x] Hero section: latest/best video + Play
- [x] Horizontal card rows per video-tag
- [x] **MX Player sheet**: fullscreen, center ±10s + play/pause, bottom seek slider

## Phase 6 — Progress Bar Overhaul (R11) — BUG FIX, AGLE KARUNGE
- [ ] engine.py: job phases (`probing → downloading → merging → done`) + monotonic progress
- [ ] Video+audio dual-download: per-stream % → weighted overall % (koi bounce nahi)
- [ ] Fragment progress fallback (`fragment_index/fragment_count`) jab total_bytes na mile
- [ ] Probe phase: UI spinner + "Info fetch…" text
- [ ] Merge phase: indeterminate bar + "Converting…"
- [ ] `POST /api/jobs/{id}/cancel` + UI cancel button
- [ ] Jobs card redesign: phase label + phase-aware bar styling

## Phase 7 — Torrent Support (R12, qBittorrent)
- [ ] compose me qbittorrent sidecar (linuxserver/qbittorrent, internal network, no host port)
- [ ] qbt WebUI API client (backend/qbt.py): add, info, pause/resume, delete
- [ ] Add view: magnet/.torrent URL detect → same preview+tags flow
- [ ] Job type `torrent`: qbt progress → Jobs card (% , speed, seeds/peers, ETA)
- [ ] Complete → file move `/media/<category>/` + DB register + qbt cleanup
- [ ] Error/paused state UI + retry
- [ ] Acceptance: magnet paste → tags → progress → Movies view me play

## Phase 8 — Remaining
- [ ] Jellyfin folder browser (R2: browse API + breadcrumbs UI)
- [ ] NAS deploy + E2E verify (approval ke baad)
- [ ] Phone verify: iPhone Safari playback, PWA install, offline save

## Backlog (v2)
Auth token · playlist builder UI · sleep timer (music) · continue-watching (movies) · Jellyfin scan trigger · Torrent RSS auto-download
