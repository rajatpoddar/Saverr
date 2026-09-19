# SaverR — Rules (for coding agents & humans)

> Ye rules har code change pe follow karo. Jab conflict ho, user ka bola > ye file > apna judgment.

## 1. Production NAS Safety (CRITICAL)

1. NAS (`rajat@192.168.29.101`) pe **production apps live hain** — invoice-builder, nrega stack,
   jellyfin, coolify, cloudflared, 30+ containers. Kabhi bina confirm existing containers,
   volumes, ports, DSM configs ko touch mat karo.
2. Sirf ye NAS paths use karo:
   - `/volume1/docker/saverr/app` (code)
   - `/volume1/docker/saverr/data` (DB, thumbs, cookies)
   - `/volume1/video/saverr` (media — Jellyfin ke andar)
3. Port **8508** hi use karo. Naya port chahiye to pehle user se poochho + free verify karo.
4. NAS pe kuch bhi deploy karne se pehle **user approval lo** (deploy.sh bhi manually chalega).
5. Destructive commands (`docker system prune`, `rm -rf /volume1/...`) kabhi nahi.

## 2. Code Conventions

- Backend: Python 3.12, FastAPI async style. SQLite sync calls aiosqlite se.
- Imports: `database`/`engine` try/except fallback rakho (script vs package mode dono chale).
- Env vars pe defaults rakho — local (/tmp ya ./local-*) aur Docker (/media, /data) dono chale.
- Frontend: vanilla JS, koi build step nahi. CSS custom properties use karo (docs/DESIGN.md tokens).
- Filenames: yt-dlp `restrictfilenames` on, sanitized title + 6-char random suffix.
- New API route = `/api/*` prefix, JSON errors `{detail: "..."}`, HTTP status sahi rakho.
- Naya endpoint add karte waqt sandboxing dhyan rakho (path traversal block — `resolve()` ke baad MEDIA_DIR ke andar hona chahiye).

## 3. Mobile Compatibility (important — galti se seekha)

- Video format chain **h264/avc1 + aac preferred** (`engine.py` mein fixed chain hai).
  VP9/webm-in-mp4 desktop Chrome chalata hai par iPhone Safari NAHI.
- Frontend: safe-area insets, 44px+ touch targets, `100dvh`, `-webkit-` prefixes,
  autoplay `muted+playsinline` jab autoplay chahiye.
- Thumbnails hotlink mat karo — server proxy `/api/thumb/{id}`.

## 4. Workflow

- Pehle local (`./run.sh`), phir user approval, phir NAS deploy.
- Bada change se pehle PLAN.md / docs/TASKS.md update karo.
- Commit style: short imperative, Hinglish allowed ("add tag CRUD endpoints").
- Deploy sirf `deploy.sh` se — manual docker commands nahi.
- Naya feature → PRD.md mein R-number do → TASKS.md mein task banao → implement → test.

## 5. Skills ka sahi use

- Sirf relevant skill load karo (UI design → ui-ux-pro-max, structure questions → codebase-memory).
- Har kaam ke liye saare skills mat uthao.
- Skills ki guidance user ke explicit instructions se upar kabhi mat rakho.

## 6. Never Do

- ❌ User se poochhe bina deploy/build NAS pe
- ❌ Existing docker containers ko stop/rm karna (sivaye `saverr` ke, deploy.sh mein)
- ❌ Emojis as UI icons (SVG use karo)
- ❌ API responses cache karna service worker mein
- ❌ yt-dlp ko `nocheckcertificate=True` karna (SSL certifi se fix hota hai)
- ❌ DRM-protected content support karna
