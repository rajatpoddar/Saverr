# SaverR — Memory (Decisions & Lessons)

> Future coding agents: ye padh ke context lo. Ye file hi project ki "yaaddasht" hai.
> Har bada decision ya seekha hua cheez yahan add karo (date ke saath).

## Environment Facts

- **NAS:** Synology RS3617xs+, DSM 7.3.1, Docker 24.0.2 (ContainerManager), 12GB RAM, 4 core, 1.4TB free
- **SSH:** `rajat@192.168.29.101`, passwordless sudo available, docker full path `/usr/local/bin/docker`
- **Production containers (DO NOT TOUCH):** eci-license-server, poddar-jewellers-*, gmaps-scraper,
  hermes, invoice-builder-*, nrega-*, dorito-*, rajat-portfolio-next, ilaaqa-cafe,
  cloudflared-tunnel, coolify, krutidevstudio, otp-relay-*, jellyfin, publicstack-web,
  code-server, stirling-pdf
- **Jellyfin mount:** `/volume1/video → /media` (container) — isliye SaverR media `/volume1/video/saverr` pe
- **NAS Python 3.8** — isliye sab kuch Docker mein hi chalana
- **SaverR port:** 8508 (verified free at planning time)

## Key Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-09-19 | Single container (backend+frontend) | NAS-friendly, simple deploy, no node build |
| 2026-09-19 | SQLite over Postgres | Zero-config, kam RAM, single user |
| 2026-09-19 | Vanilla JS PWA over React | No build step, fast, easy maintenance on NAS |
| 2026-09-19 | Category = physical folder | Jellyfin auto-detection ke liye zaroori |
| 2026-09-20 | Tags = DB-level only (not folders) | Jellyfin folder structure disturb na ho |
| 2026-09-20 | h264/avc1 format chain | VP9-in-mp4 iPhone Safari pe nahi chalta (real bug mila) |
| 2026-09-20 | Git-based deploy.sh | User ne bola: repo se pull karke deploy ho |
| 2026-09-20 | Tag hierarchy: songs→moods (80s, party, romantic, focus, sad, sleep, relax, feel-good, work-out), podcast alag | Personal music player banega — mood playlists tags se |
| 2026-09-20 | 4 content views: Music (basic player), Reels (insta-style), Movies (netflix-style + MX player), Add | SaverR = personal entertainment platform |
| 2026-09-20 | Paste → preview → audio/video select flow | User explicitly manga — link paste ke baad type choose ho |
| 2026-09-20 | Repo: github.com/rajatpoddar/Saverr.git | Official remote |

## Lessons Learned (Gotchas)

1. **macOS venv Python SSL:** python.org Python ke venv mein CA bundle nahi hoti →
   `CERTIFICATE_VERIFY_FAILED` yt-dlp pe. Fix: `pip install certifi` + `SSL_CERT_FILE=$(python -m certifi)`
   (run.sh mein handled).
2. **Mobile codec:** Desktop Chrome VP9-in-mp4 chala leta hai, iPhone Safari nahi.
   Format chain mein `vcodec^=avc1` pehle rakho.
3. **Instagram CDN thumbnails** hotlink block karti hai → server-side proxy + cache chahiye.
4. **Synology non-interactive SSH** mein PATH chhota hota hai — `docker` full path se ya
   `sudo -n /usr/local/bin/docker` use karo.
5. **user: "1026:100"** container mein — wrna files root ke ban jaati aur SMB/Jellyfin
   permission issue aata.
6. **StaticFiles mount "/"** sabse last mein karo, warna `/api/*` routes chha jaate.
7. **User workflow:** pehle MD planning approve, phir code. Deploy kabhi bina poochhe nahi.
   Sirf relevant skills use karo, saare nahi.

## User Preferences

- Language: Hinglish (Hindi + English mix) — technical terms English mein
- Mobile experience sabse important (iPhone use karta hai)
- Production NAS pe dusre apps hain — safety #1 priority
- Deploy scripts pasand hai (run.sh, deploy.sh) — manual commands nahi
- Tags feature sabse important bola hai v1.5 mein
- **v1.6 vision:** ye personal music player + reels + netflix + mx player banega — UI mode content type ke hisaab se: audio=basic player, reels=insta, movies=netflix, music videos=mx player style
- Planning pehle likho (docs), approval lo, phir implement karo

## Open Questions

- New repo URL? (user create kar raha hai)
- Cloudflare tunnel domain kaunsa hoga? (user dashboard se add karega)
- Feed autoplay: muted-by-default theek hai ya sound-on first tap?
