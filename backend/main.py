"""SaverR API — FastAPI app: download queue, media library, streaming."""
import asyncio
import hashlib
import urllib.request
import uuid as uuidlib
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

try:
    import database as dbm
    import engine
except ImportError:  # package-style: uvicorn backend.main:app
    from backend import database as dbm
    from backend import engine

app = FastAPI(title="SaverR", docs_url="/api/docs", openapi_url="/api/openapi.json")

MAX_PARALLEL = 2
MAX_JOBS_KEEP = 200
queue: asyncio.Queue = asyncio.Queue()
_workers_started = False


# ---------------------------------------------------------------- workers
async def _worker():
    while True:
        job_id = await queue.get()
        job = engine.JOBS.get(job_id)
        if job is None:
            queue.task_done()
            continue
        job["status"] = "downloading"
        await engine.run_download(job_id, job["url"], job["category"], job["mode"],
                                  tags=job.get("tags"))
        if job.get("status") == "done":
            media_id = uuidlib.uuid4().hex[:12]
            try:
                await dbm.add_media({
                    "id": media_id,
                    "url": job["url"],
                    "category": job["category"],
                    "mode": job["mode"],
                    "title": job.get("title") or "video",
                    "filename": job["filename"],
                    "ext": job.get("ext"),
                    "filesize": job.get("filesize"),
                    "duration": job.get("duration"),
                    "uploader": job.get("uploader"),
                    "extractor": job.get("extractor"),
                    "thumbnail": job.get("thumbnail"),
                })
                tag_names = list(job.get("tags") or [])
                if job.get("category") and job["category"] != "other":
                    tag_names.append(job["category"])
                if tag_names:
                    await dbm.set_media_tags(
                        media_id, tag_names,
                        kind="audio" if job["mode"] == "audio" else "video")
            except Exception as e:
                job["status"] = "error"
                job["error"] = f"db: {e}"
        queue.task_done()
        # trim old finished jobs
        done = [k for k, v in engine.JOBS.items()
                if v.get("status") in ("done", "error")]
        if len(engine.JOBS) > MAX_JOBS_KEEP:
            for k in done[: len(done) // 2]:
                engine.JOBS.pop(k, None)


@app.on_event("startup")
async def startup():
    global _workers_started
    await dbm.init_db()
    await sync_folders()
    if not _workers_started:
        for _ in range(MAX_PARALLEL):
            asyncio.create_task(_worker())
        _workers_started = True


# ---------------------------------------------------------------- helpers
def _job_view(job_id: str, job: dict) -> dict:
    return {
        "id": job_id,
        "url": job.get("url"),
        "category": job.get("category"),
        "mode": job.get("mode"),
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "speed": job.get("speed"),
        "eta": job.get("eta"),
        "error": job.get("error"),
        "title": job.get("title"),
        "filename": job.get("filename"),
        "tags": job.get("tags"),
    }


def _file_response_headers(filename: str, download: bool) -> dict:
    import urllib.parse
    safe = urllib.parse.quote(filename)
    cd = f"attachment; filename*=UTF-8''{safe}" if download else "inline"
    return {"Content-Disposition": cd, "Accept-Ranges": "bytes"}


# ---------------------------------------------------------------- API
@app.post("/api/download")
async def create_download(body: dict):
    url = (body.get("url") or "").strip()
    category = (body.get("category") or "other").lower().strip()
    mode = (body.get("mode") or "video").lower().strip()
    tags = [str(t).strip().lower()[:40] for t in (body.get("tags") or []) if str(t).strip()][:10]
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid URL")
    if category not in engine.CATEGORIES:
        category = "other"
    if mode not in ("video", "audio"):
        mode = "video"

    existing = await dbm.find_by_url(url, mode)
    if existing:
        return JSONResponse({
            "duplicate": True,
            "message": "Ye URL pehle se saved hai",
            "media": existing,
        }, status_code=200)

    job_id = uuidlib.uuid4().hex[:12]
    engine.JOBS[job_id] = {
        "url": url, "category": category, "mode": mode, "tags": tags,
        "status": "queued", "progress": 0,
    }
    await queue.put(job_id)
    qpos = queue.qsize()
    return {"job_id": job_id, "queued_behind": qpos, "duplicate": False}


@app.get("/api/probe")
async def probe_url(url: str):
    """Paste-preview: light metadata fetch (no download)."""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid URL")
    meta = await engine.probe(url)
    if not meta:
        raise HTTPException(422, "Link se info nahi mili — supported site hai kya?")
    existing_v = await dbm.find_by_url(url, "video")
    existing_a = await dbm.find_by_url(url, "audio")
    meta["saved_video"] = bool(existing_v)
    meta["saved_audio"] = bool(existing_a)
    return meta


# ---------------------------------------------------------------- tags API
@app.get("/api/tags")
async def tags_list():
    return await dbm.list_tags()


@app.post("/api/tags")
async def tags_create(body: dict):
    name = (body.get("name") or "").strip().lower().replace(" ", "-")[:40]
    if not name:
        raise HTTPException(400, "Tag name chahiye")
    if await dbm.get_tag_by_name(name):
        raise HTTPException(409, "Tag pehle se hai")
    parent = body.get("parent")
    parent_id = None
    kind = body.get("kind")
    if parent:
        prow = await dbm.get_tag_by_name(parent)
        if not prow:
            raise HTTPException(404, f"Parent tag '{parent}' nahi mila")
        parent_id = prow["id"]
        kind = prow["kind"]  # child inherits kind
    if kind not in ("audio", "video", None):
        kind = None
    tag_id = await dbm.add_tag(name, parent_id, kind)
    return {"id": tag_id, "name": name, "parent": parent, "kind": kind}


@app.patch("/api/tags/{tag_id}")
async def tags_rename(tag_id: int, body: dict):
    new_name = (body.get("name") or "").strip().lower().replace(" ", "-")[:40]
    if not new_name:
        raise HTTPException(400, "Naya naam chahiye")
    await dbm.rename_tag(tag_id, new_name)
    return {"ok": True}


@app.delete("/api/tags/{tag_id}")
async def tags_delete(tag_id: int):
    deleted = await dbm.delete_tag(tag_id)
    return {"deleted": deleted}


@app.post("/api/media/{media_id}/tags")
async def media_tags_set(media_id: str, body: dict):
    row = await dbm.get_media(media_id)
    if not row:
        raise HTTPException(404, "Media nahi mila")
    tag_names = [str(t) for t in (body.get("tags") or [])][:15]
    kind = "audio" if row["mode"] == "audio" else "video"
    await dbm.set_media_tags(media_id, tag_names, kind=kind)
    return {"tags": await dbm.get_media_tag_names(media_id)}


@app.get("/api/jobs")
async def list_jobs():
    return [_job_view(k, v) for k, v in reversed(list(engine.JOBS.items()))]


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = engine.JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _job_view(job_id, job)


@app.get("/api/media")
async def media_list(category: str = "all", q: str = "",
                     kind: str = "", tag: str = ""):
    items = await dbm.list_media(category or None, q or None,
                                 kind or None, tag or None)
    return {"count": len(items), "items": items}


@app.delete("/api/media/{media_id}")
async def media_delete(media_id: str):
    row = await dbm.delete_media(media_id)
    if not row:
        raise HTTPException(404, "Not found")
    fp = engine.MEDIA_DIR / row["category"] / row["filename"]
    if fp.exists():
        fp.unlink()
    return {"deleted": True}


def _parse_range(range_header: str, size: int) -> tuple[int, int] | None:
    try:
        unit, rng = range_header.split("=", 1)
        if unit.strip() != "bytes":
            return None
        start_s, _, end_s = rng.partition("-")
        if not start_s:
            # suffix range: last N bytes
            length = min(int(end_s), size)
            return (size - length, size - 1)
        start = int(start_s)
        end = min(int(end_s), size - 1) if end_s else size - 1
        if start > end or start >= size:
            return None
        return (start, end)
    except Exception:
        return None


async def _file_stream(path: Path, start: int, end: int, chunk: int = 256 * 1024):
    async def gen():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data
    return gen


@app.get("/api/media/{media_id}/stream")
async def media_stream(media_id: str, request: Request):
    row = await dbm.get_media(media_id)
    if not row:
        raise HTTPException(404, "Not found")
    fp = engine.MEDIA_DIR / row["category"] / row["filename"]
    if not fp.exists():
        raise HTTPException(404, "File missing on disk")
    size = fp.stat().st_size
    rng = request.headers.get("range")
    ctype = {"mp4": "video/mp4", "mp3": "audio/mpeg", "m4a": "audio/mp4",
             "webm": "video/webm", "mkv": "video/x-matroska"}.get(
                 (row.get("ext") or "").lower(), "application/octet-stream")
    if rng:
        parsed = _parse_range(rng, size)
        if parsed is None:
            return StreamingResponse(status_code=416, media_type=ctype,
                                     headers={"Content-Range": f"bytes */{size}"})
        start, end = parsed
        gen = await _file_stream(fp, start, end)
        return StreamingResponse(gen(), status_code=206, media_type=ctype,
                                 headers={"Content-Range": f"bytes {start}-{end}/{size}",
                                          "Accept-Ranges": "bytes",
                                          "Content-Length": str(end - start + 1),
                                          **_file_response_headers(fp.name, False)})
    return FileResponse(fp, media_type=ctype,
                        headers=_file_response_headers(fp.name, False))


@app.get("/api/media/{media_id}/file")
async def media_file(media_id: str):
    row = await dbm.get_media(media_id)
    if not row:
        raise HTTPException(404, "Not found")
    fp = engine.MEDIA_DIR / row["category"] / row["filename"]
    if not fp.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(fp, filename=fp.name)


@app.get("/api/thumb/{media_id}")
async def thumb(media_id: str):
    """Server-side thumbnail proxy (Instagram CDN blocks hotlinking)."""
    row = await dbm.get_media(media_id)
    if not row or not row.get("thumbnail"):
        raise HTTPException(404, "No thumbnail")
    cache = engine.DATA_DIR / "thumbs"
    cache.mkdir(parents=True, exist_ok=True)
    key = hashlib.md5(row["thumbnail"].encode()).hexdigest()[:16]
    ext = ".jpg"
    local = cache / f"{key}{ext}"
    if not local.exists():
        def _fetch():
            req = urllib.request.Request(
                row["thumbnail"],
                headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
                         "Referer": "https://www.instagram.com/"})
            with urllib.request.urlopen(req, timeout=15) as r, open(local, "wb") as f:
                f.write(r.read(2 * 1024 * 1024))
        try:
            await asyncio.to_thread(_fetch)
        except Exception:
            raise HTTPException(404, "Thumb fetch failed")
    return FileResponse(local, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/categories")
async def categories():
    return engine.CATEGORIES


@app.get("/api/stats")
async def stats():
    return await dbm.stats()


@app.get("/api/config")
async def config():
    tunnel_file = engine.DATA_DIR / "tunnel_url.txt"
    tunnel = None
    if tunnel_file.exists():
        tunnel = tunnel_file.read_text().strip() or None
    import os
    return {"tunnel_url": tunnel or os.getenv("TUNNEL_URL"),
            "lan_url": os.getenv("LAN_URL", "http://192.168.29.101:8508")}


@app.post("/api/sync")
async def sync_folders():
    """Scan /media vs DB: add orphan files, purge deleted rows."""
    added, purged = 0, 0
    known = await dbm.all_filenames()
    missing = []
    seen: set[str] = set()
    media_root = engine.MEDIA_DIR
    if media_root.exists():
        for catdir in sorted(media_root.iterdir()):
            if not catdir.is_dir() or catdir.name.startswith("."):
                continue
            for fp in sorted(catdir.iterdir()):
                if fp.name.startswith(".") or fp.name.endswith((".part", ".ytdl")):
                    continue
                seen.add(fp.name)
                if fp.name in known:
                    continue
                stem = fp.stem.rsplit("_", 1)[0].replace("_", " ")
                import os
                await dbm.add_media({
                    "id": uuidlib.uuid4().hex[:12],
                    "url": "", "category": catdir.name, "mode":
                    "audio" if fp.suffix.lower() in (".mp3", ".m4a") else "video",
                    "title": stem or fp.stem, "filename": fp.name,
                    "ext": fp.suffix.lstrip("."), "filesize": fp.stat().st_size,
                    "thumbnail": None, "extractor": "imported",
                })
                added += 1
    for fn in known:
        if fn not in seen:
            missing.append(fn)
    if missing:
        await dbm.purge_missing(missing)
        purged = len(missing)
    return {"added": added, "purged": purged}


@app.get("/api/health")
async def health():
    return {"ok": True}


# static frontend LAST so /api/* wins
import os
STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
