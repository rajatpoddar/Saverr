# SaverR — Tasks (v1.6)

> Order: pehle simple features, phir complex views. PRD R-numbers se mapped.

## Phase 0 — Repo & Setup
- [ ] git init, remote add origin https://github.com/rajatpoddar/Saverr.git
- [ ] First push (code + docs + scripts)
- [ ] .gitignore verify (venv, local-data, cookies out)

## Phase 1 — Simple Wins (pehle ye)
- [x] Mobile codec fix (avc1 chain) — engine.py
- [x] deploy.sh, run.sh, SSL certifi fix
- [ ] Probe endpoint: `GET /api/probe?url=` — title/thumbnail/duration (preview ke liye)
- [ ] Paste → preview card UI (thumbnail + title + duration)
- [ ] Audio/Video select buttons preview card pe (R6)

## Phase 2 — Tags with Hierarchy (R1 + R7) — CORE
- [ ] DB migration: `tags(id, name, parent_id, kind, created_at)` + `media_tags(media_id, tag_id)`
- [ ] Seed tags: podcast, songs → (80s, 90s, 00s, party, romantic, focus, sad, sleep, relax, feel-good, work-out) + video: reels, music-videos, movies
- [ ] database.py: tag CRUD + `get_tag_tree` + `resolve_tag_with_descendants`
- [ ] API: `GET/POST /api/tags`, `PATCH/DELETE /api/tags/{id}`, `POST /api/media/{id}/tags`
- [ ] Download flow me tags save karna (job payload → media_tags)
- [ ] Tag manage UI: library header se — add (parent select + kind), rename, delete

## Phase 3 — Music View (R8)
- [ ] `GET /api/media?kind=audio&tag=` filter (tag descendants included)
- [ ] Music tab UI: playlist chips (podcast/songs/moods), song list
- [ ] **Mini player bar** (global): current track, play/pause, next
- [ ] **Now Playing sheet**: big art, seek slider, prev/next, auto-advance queue
- [ ] Audio state module (app.js): queue, currentIndex, single global <audio>

## Phase 4 — Reels View (R3 + R9)
- [ ] Full-screen snap-scroll container (100dvh slides)
- [ ] IntersectionObserver autoplay/pause + preload next
- [ ] Mute toggle, tap play/pause, overlay meta + tags
- [ ] Filter: reels tag / all video shorts

## Phase 5 — Movies View (R10)
- [ ] Hero section: latest/best video + Play
- [ ] Horizontal card rows per video-tag
- [ ] **MX Player sheet**: fullscreen, center ±10s + play/pause, bottom seek slider, double-tap seek (mobile), landscape support

## Phase 6 — Library + Browse (R2)
- [ ] Library grid: tag filter chips (tree-aware)
- [ ] Jellyfin folder browser: `GET /api/browse?path=` sandboxed + breadcrumbs UI
- [ ] Stats card in Add view + tag manage entry

## Phase 7 — Deploy & Verify
- [ ] deploy.sh test on NAS
- [ ] E2E: paste→preview→audio/video→tags→download→music/reels/movies play
- [ ] Phone verify: iPhone Safari playback, PWA install, offline save

## Backlog (v2)
Auth token · playlist builder UI · sleep timer (music) · continue-watching (movies) · Jellyfin scan trigger
