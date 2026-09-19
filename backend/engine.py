"""yt-dlp engine wrapper: downloads with progress hooks, cookie support, metadata."""
import asyncio
import os
import re
import shutil
import uuid
import yt_dlp
from pathlib import Path

MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "/media"))
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))

CATEGORIES = [
    "reels", "music", "recipes", "funny", "technology", "business",
    "movies", "fitness", "photography", "git", "travel", "fashion",
    "marketing", "books", "food", "other",
]

JOBS: dict[str, dict] = {}  # job_id -> job state (in-memory queue)

YDL_BASE = {
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "restrictfilenames": True,
    "retries": 3,
    "socket_timeout": 30,
    "nocheckcertificate": False,
}


def _sanitize(name: str, maxlen: int = 80) -> str:
    name = re.sub(r"[^\w\s.-]", "", name, flags=re.UNICODE)
    name = re.sub(r"[\s_]+", "_", name).strip("._ ")
    return (name or "video")[:maxlen]


def _cookies_args(site: str) -> dict:
    """Optional cookies: /data/instagram_cookies.txt or /data/youtube_cookies.txt"""
    p = DATA_DIR / f"{site}_cookies.txt"
    if p.exists():
        return {"cookiefile": str(p)}
    return {}


class ProgressHook:
    def __init__(self, job_id: str):
        self.job_id = job_id

    def __call__(self, d):
        job = JOBS.get(self.job_id)
        if not job:
            return
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes", 0)
            job["progress"] = round(done / total * 100, 1) if total else 0
            job["speed"] = d.get("_speed_str", "").strip() or None
            job["eta"] = d.get("_eta_str", "").strip() or None
        elif d["status"] == "finished":
            job["progress"] = 99.0
            job["status"] = "processing"


def _detect_site(url: str) -> str:
    u = url.lower()
    if "instagram.com" in u:
        return "instagram"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    return "generic"


async def probe(url: str) -> dict | None:
    """Light metadata probe (no download). Returns None on failure."""
    def _probe():
        with yt_dlp.YoutubeDL({**YDL_BASE, "extract_flat": False}) as ydl:
            return ydl.extract_info(url, download=False)
    try:
        info = await asyncio.wait_for(asyncio.to_thread(_probe), timeout=45)
    except Exception:
        return None
    return {
        "title": info.get("title") or "video",
        "duration": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
        "extractor": (info.get("extractor_key") or "").lower(),
        "thumbnail": info.get("thumbnail"),
    }


async def run_download(job_id: str, url: str, category: str, mode: str,
                       title_hint: str | None = None):
    """Blocking download executed in a worker. Updates JOBS[job_id]."""
    job = JOBS[job_id]
    try:
        site = _detect_site(url)
        meta = await probe(url)
        title = _sanitize((meta or {}).get("title") or title_hint or "video")
        duration = (meta or {}).get("duration")
        uploader = (meta or {}).get("uploader")
        extractor = (meta or {}).get("extractor") or site
        thumbnail = (meta or {}).get("thumbnail")

        outdir = MEDIA_DIR / category
        outdir.mkdir(parents=True, exist_ok=True)
        stem = f"{title}_{uuid.uuid4().hex[:6]}"
        outtmpl = str(outdir / stem)

        # Mobile-friendly codec chain: h264/avc1 + aac preferred (iPhone Safari
        # VP9-in-mp4 nahi chalata; desktop Chrome chala leta hai — classic bug).
        if mode == "video":
            fmt = ("bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[acodec^=mp4a]/"
                   "bestvideo[vcodec^=avc1]+bestaudio/"
                   "bestvideo*+bestaudio/best")
        else:
            fmt = "bestaudio/best"
        opts = {
            **YDL_BASE,
            "format": fmt,
            "outtmpl": outtmpl + ".%(ext)s",
            "progress_hooks": [ProgressHook(job_id)],
            "merge_output_format": "mp4" if mode == "video" else None,
            **_cookies_args(site),
        }
        if mode == "audio":
            opts.update({
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }],
                "format": "bestaudio/best",
            })

        def _dl():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=True)

        info = await asyncio.wait_for(asyncio.to_thread(_dl), timeout=3600)

        # resolve actual file (ext may differ after merge/extract)
        filepath = None
        if info and info.get("requested_downloads"):
            filepath = info["requested_downloads"][0].get("filepath")
        if not filepath:
            candidates = sorted(outdir.glob(stem + ".*"))
            filepath = str(candidates[0]) if candidates else None
        if not filepath:
            raise RuntimeError("Download finished but file not found")

        fp = Path(filepath)
        job.update({
            "status": "done", "progress": 100.0, "filepath": str(fp),
            "filename": fp.name, "ext": fp.suffix.lstrip("."),
            "filesize": fp.stat().st_size, "duration": duration,
            "uploader": uploader, "extractor": extractor,
            "thumbnail": thumbnail, "title": (meta or {}).get("title") or title,
        })
    except Exception as e:
        job.update({"status": "error", "error": str(e)[:500]})
