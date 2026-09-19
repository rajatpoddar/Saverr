# SaverR — Product Requirements Document (PRD)

> Version: 1.7 · Date: 2026-09-20 · Owner: Rajat
> **SaverR ab ek personal media platform hai** — Music Player + Reels Feed + Movies (Netflix-style) + MX-style video player. Sab tag-driven.

## 1. Vision

Rajat ka personal entertainment hub on NAS:
- **🎵 Music Player** — podcast + songs (mood playlists: 80s, 90s, 00s, party, romantic, focus, sad, sleep, relax, feel-good, work-out) → basic music player UI (mini player + Now Playing)
- **📱 Reels** — Instagram-jaisi full-screen swipe feed, tags ke hisaab se
- **🎬 Movies/Music Videos** — Netflix-jaisa browse (hero + rows), MX-Player-jaisa video player
- **📥 Add** — link paste → preview → Audio/Video select → category + tags → download

Ek hi app se: personal music player + reels scrolling + movie night. 

## 2. v1 (done)

Download engine (yt-dlp, avc1 mobile codec), categories (15 folders, Jellyfin), PWA (Add/Library/Stats), live progress, streaming seek, offline save, LAN/tunnel detect, SSL fix, deploy.sh, docs.

## 3. v1.5 Requirements

- **R1 Tag CRUD** — add/edit/rename/remove/delete tags; media pe multi-tag
- **R2 Jellyfin Folder Browser** — filesystem-jaisa browse, dashboard pe flat spread nahi
- **R3 Reels Feed** — full-screen vertical snap scroll, autoplay on visible
- **R4 Mobile Playback** — ✅ avc1 codec chain fix; phone pe verify pending
- **R5 deploy.sh** — ✅ git pull → stop → build → run

## 4. v1.6 Requirements (CURRENT SCOPE — user ne aaj add kiya)

### R6. Paste → Preview → Type Select
- Link paste karte hi auto **probe** (title, thumbnail, duration, source)
- Preview card: thumbnail + title + duration + 2 buttons: **🎵 Audio** / **🎬 Video**
- Category select + **tag multi-select** (type ke hisaab se tags filter honge)
- Download → job with tags
- **Status: ✅ Built** (local verified, probe/test pass)

### R7. Tag Hierarchy (Sub-tags)
```
audio-kind tags                video-kind tags
├── podcast                    ├── reels
└── songs                      ├── music-videos
    ├── 80s    ├── party       └── movies
    ├── 90s    ├── romantic
    ├── 00s    ├── focus
    ├── sad    ├── sleep
    ├── relax  ├── feel-good
    └── work-out
```
- DB: `tags.parent_id` self-reference, `kind` column (audio|video)
- Tag filter me **descendants include** (Songs filter = saare moods)
- Tag manage UI: add (with parent), rename, delete (cascade children)
- **Status: ✅ Built** (16 seed tags, descendant filter test pass)

### R8. Music View (Basic Audio Player UI)
- Playlist chips: All · Podcast · Songs · saare moods
- Song list: artwork thumb, title, uploader, duration
- **Mini player** (bottom, sab views pe dikhe): art, title, play/pause, next
- **Now Playing sheet** (tap mini player): bada artwork, title, artist, seek slider, prev/play/next, auto-advance queue
- **Status: ✅ Built**

### R9. Reels View (Instagram-style)
- Full-screen 100dvh slides, vertical snap scroll
- Autoplay visible slide (muted start + mute toggle), tap = play/pause
- Overlay: title + tags; side actions: offline save
- Filter chips: reels tag / all videos
- **Status: ✅ Built**

### R10. Movies View (Netflix-style browse + MX Player)
- **Hero**: latest video ka backdrop + title + Play
- **Rows**: har video-tag ka horizontal card row (Movies, Music Videos, …)
- **MX Player sheet**: fullscreen black, custom controls — center ±10s + play/pause, seek slider, title, close
- **Status: ✅ Built**

---

## 4a. v1.7 Requirements (NAYA SCOPE — current phase)

### R11. Progress Bar Overhaul (bug fix — user reported)
**Problem:** Downloading/converting progress sahi nahi dikhta:
- video+audio dono alag download hote hain — bar 100% → phir 0% pe bounce karta hai
- probe (info fetch) ke time 0% stuck lagta hai
- fragments/HLS streams me total_bytes nahi milta → 0% hi rehta hai
- audio download ke waqt status galat "Converting" dikhta hai
- ffmpeg merge ke waqt koi feedback nahi (99% stuck)

**Fix (yeh karna hai):**
- Job me **phases**: `probing → downloading → merging → done`
- Downloading me **phase detail**: `video 45%` / `audio 80%` — bar monotonic (overall weighted %)
- Fragment fallback: `fragment_index/fragment_count` se progress jab bytes na milein
- Probe phase UI: spinner + "Info fetch…"
- Merging: indeterminate bar animation + "Converting with ffmpeg…"
- `POST /api/jobs/{id}/cancel` — chalu job cancel karna

### R12. Torrent Support (qBittorrent)
**Source repo:** https://github.com/qbittorrent/qBittorrent.git
**Approach:** qBittorrent **sidecar container** (qbittorrent-nox image) SaverR compose me —
SaverR backend uske **WebUI API** (`/api/v2/...`) ko call karega. Khud torrent engine
likhna nahi — qbt stable + mature hai.

**Flow:**
1. Add view me naya input: **magnet link ya .torrent URL** (paste → detect auto)
2. Preview me category + tags select (same R6 flow; mode=video assume)
3. Backend → qbt API `torrents/add` → qbt download karta hai shared `/media/torrents-tmp` me
4. Progress polling: `torrents/info` → same Jobs card me dikhana (%, speed, seeds/peers, ETA)
5. Complete → file(s) `/media/<category>/` me move + DB register (tags ke saath) → qbt se delete
6. Paused/errored torrents UI me dikhna chahiye

**Infra:**
- compose me `qbittorrent` service (linuxserver/qbittorrent), internal network only —
  **host port expose NAHI** (security), creds env se (`QBT_URL`, `QBT_USER`, `QBT_PASS`)
- Shared volume: `/media` dono containers me
- Category mapping: qbt "categories" use karke save-path set karna

**Acceptance:** magnet paste → tags → download → progress dikhe → complete hone pe Music/Movies view me play ho

## 5. Navigation

`Add | Music | Reels | Movies | Library` (5 tabs; Stats Add-view card me, Tag-manage Library header me) — ✅ Built

Torrent input R12 ke baad Add view me hi hoga (URL vs magnet auto-detect).

## 6. Non-Goals
DRM, multi-user auth (v2 backlog), native apps, comments/social.

## 7. Constraints
NAS RS3617xs+ shared with production; port 8508; container 1GB/1.5CPU; SQLite.

## 8. Success Metrics
- Music: tap→play < 1s, queue auto-advance, seek smooth
- Reels: swipe smooth 60fps, next video preload
- Movies: MX controls responsive, landscape OK
- Sab kuch tags se driven — naya mood tag add karo, instantly playlist ban jata hai
