"""SQLite database layer for SaverR (aiosqlite)."""
import os

import aiosqlite
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path(os.getenv("DATA_DIR", "/data")) / "saverr.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'other',
                mode TEXT NOT NULL DEFAULT 'video',
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                ext TEXT,
                filesize INTEGER,
                duration REAL,
                uploader TEXT,
                extractor TEXT,
                thumbnail TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_category ON media(category)"
        )
        await db.execute("CREATE INDEX IF NOT EXISTS idx_media_url ON media(url)")
        await db.commit()


async def add_media(m: dict) -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO media
               (id, url, category, mode, title, filename, ext, filesize,
                duration, uploader, extractor, thumbnail, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                m["id"], m["url"], m["category"], m["mode"], m["title"],
                m["filename"], m.get("ext"), m.get("filesize"),
                m.get("duration"), m.get("uploader"), m.get("extractor"),
                m.get("thumbnail"), _now(),
            ),
        )
        await db.commit()
    return m["id"]


async def get_media(media_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM media WHERE id = ?", (media_id,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def find_by_url(url: str, mode: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM media WHERE url = ? AND mode = ? LIMIT 1", (url, mode)
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def list_media(category: str | None = None, q: str | None = None,
                     limit: int = 500) -> list[dict]:
    sql = "SELECT * FROM media WHERE 1=1"
    args: list = []
    if category and category != "all":
        sql += " AND category = ?"
        args.append(category)
    if q:
        sql += " AND title LIKE ?"
        args.append(f"%{q}%")
    sql += " ORDER BY created_at DESC LIMIT ?"
    args.append(limit)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(sql, args)
        return [dict(r) for r in await cur.fetchall()]


async def delete_media(media_id: str) -> dict | None:
    """Return the row before deleting so caller can remove files."""
    row = await get_media(media_id)
    if row:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM media WHERE id = ?", (media_id,))
            await db.commit()
    return row


async def stats() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT category, COUNT(*) as count, COALESCE(SUM(filesize),0) as size "
            "FROM media GROUP BY category ORDER BY count DESC"
        )
        by_category = [dict(r) for r in await cur.fetchall()]
        cur = await db.execute(
            "SELECT COUNT(*) as c, COALESCE(SUM(filesize),0) as s FROM media"
        )
        total = dict(await cur.fetchone())
        return {"total_count": total["c"], "total_size": total["s"],
                "by_category": by_category}


async def all_filenames() -> set[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT filename FROM media")
        return {r[0] for r in await cur.fetchall()}


async def purge_missing(missing_filenames: list[str]):
    async with aiosqlite.connect(DB_PATH) as db:
        for fn in missing_filenames:
            await db.execute("DELETE FROM media WHERE filename = ?", (fn,))
        await db.commit()
