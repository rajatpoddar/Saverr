"""SQLite database layer for SaverR (aiosqlite) — media + hierarchical tags."""
import os

import aiosqlite
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path(os.getenv("DATA_DIR", "/data")) / "saverr.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Default tag tree: (name, parent_name_or_None, kind)
SEED_TAGS = [
    ("podcast", None, "audio"),
    ("songs", None, "audio"),
    ("80s", "songs", "audio"), ("90s", "songs", "audio"), ("00s", "songs", "audio"),
    ("party", "songs", "audio"), ("romantic", "songs", "audio"),
    ("focus", "songs", "audio"), ("sad", "songs", "audio"),
    ("sleep", "songs", "audio"), ("relax", "songs", "audio"),
    ("feel-good", "songs", "audio"), ("work-out", "songs", "audio"),
    ("reels", None, "video"),
    ("music-videos", None, "video"),
    ("movies", None, "video"),
]


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
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                kind TEXT CHECK (kind IN ('audio', 'video')),
                created_at TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS media_tags (
                media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (media_id, tag_id)
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id)"
        )
        # seed default tags (idempotent)
        for name, parent, kind in SEED_TAGS:
            parent_id = None
            if parent:
                cur = await db.execute("SELECT id FROM tags WHERE name = ?", (parent,))
                row = await cur.fetchone()
                parent_id = row[0] if row else None
            await db.execute(
                "INSERT OR IGNORE INTO tags (name, parent_id, kind, created_at) "
                "VALUES (?,?,?,?)",
                (name, parent_id, kind, _now()),
            )
        await db.commit()


# ---------------------------------------------------------------- media
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
                     kind: str | None = None, tag: str | None = None,
                     limit: int = 500) -> list[dict]:
    """List media with optional filters. kind: audio|video. tag: name (descendants included)."""
    sql = """SELECT m.*, GROUP_CONCAT(t.name) AS tag_names
             FROM media m
             LEFT JOIN media_tags mt ON mt.media_id = m.id
             LEFT JOIN tags t ON t.id = mt.tag_id
             WHERE 1=1"""
    args: list = []
    if category and category != "all":
        sql += " AND m.category = ?"
        args.append(category)
    if q:
        sql += " AND m.title LIKE ?"
        args.append(f"%{q}%")
    if kind in ("audio", "video"):
        sql += " AND m.mode = ?"
        args.append(kind)
    if tag:
        tag_ids = await resolve_tag_ids_with_descendants(tag)
        if tag_ids:
            marks = ",".join("?" * len(tag_ids))
            sql += (f" AND m.id IN (SELECT media_id FROM media_tags "
                    f"WHERE tag_id IN ({marks}))")
            args.extend(tag_ids)
        else:
            return []
    sql += " GROUP BY m.id ORDER BY m.created_at DESC LIMIT ?"
    args.append(limit)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(sql, args)
        rows = [dict(r) for r in await cur.fetchall()]
    for r in rows:
        r["tags"] = (r.pop("tag_names") or "").split(",") if r.get("tag_names") else []
    return rows


async def delete_media(media_id: str) -> dict | None:
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
        cur = await db.execute("SELECT mode, COUNT(*) as c FROM media GROUP BY mode")
        by_kind = {r["mode"]: r["c"] for r in await cur.fetchall()}
        return {"total_count": total["c"], "total_size": total["s"],
                "by_category": by_category, "by_kind": by_kind}


async def all_filenames() -> set[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT filename FROM media")
        return {r[0] for r in await cur.fetchall()}


async def purge_missing(missing_filenames: list[str]):
    async with aiosqlite.connect(DB_PATH) as db:
        for fn in missing_filenames:
            await db.execute("DELETE FROM media WHERE filename = ?", (fn,))
        await db.commit()


# ---------------------------------------------------------------- tags
async def list_tags() -> list[dict]:
    """All tags with parent info + usage count."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            """SELECT t.id, t.name, t.parent_id, t.kind,
                      p.name AS parent_name,
                      (SELECT COUNT(*) FROM media_tags mt
                       WHERE mt.tag_id = t.id) AS usage_count
               FROM tags t LEFT JOIN tags p ON p.id = t.parent_id
               ORDER BY t.kind, t.name"""
        )
        return [dict(r) for r in await cur.fetchall()]


async def get_tag_by_name(name: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM tags WHERE name = ?", (name,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def add_tag(name: str, parent_id: int | None, kind: str | None) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO tags (name, parent_id, kind, created_at) VALUES (?,?,?,?)",
            (name, parent_id, kind, _now()),
        )
        await db.commit()
        return cur.lastrowid


async def rename_tag(tag_id: int, new_name: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE tags SET name = ? WHERE id = ?", (new_name, tag_id))
        await db.commit()


async def delete_tag(tag_id: int) -> int:
    """Delete tag + its children (manual cascade for reliability). Returns count deleted."""
    async with aiosqlite.connect(DB_PATH) as db:
        ids = [tag_id]
        # collect descendants (BFS)
        frontier = [tag_id]
        while frontier:
            marks = ",".join("?" * len(frontier))
            cur = await db.execute(
                f"SELECT id FROM tags WHERE parent_id IN ({marks})", frontier
            )
            children = [r[0] for r in await cur.fetchall()]
            ids.extend(children)
            frontier = children
        marks = ",".join("?" * len(ids))
        await db.execute(f"DELETE FROM media_tags WHERE tag_id IN ({marks})", ids)
        await db.execute(f"DELETE FROM tags WHERE id IN ({marks})", ids)
        await db.commit()
        return len(ids)


async def resolve_tag_ids_with_descendants(name: str) -> list[int]:
    """Tag id + all descendant ids (for filter: 'songs' includes moods)."""
    root = await get_tag_by_name(name)
    if not root:
        return []
    ids = [root["id"]]
    frontier = [root["id"]]
    async with aiosqlite.connect(DB_PATH) as db:
        while frontier:
            marks = ",".join("?" * len(frontier))
            cur = await db.execute(
                f"SELECT id FROM tags WHERE parent_id IN ({marks})", frontier
            )
            children = [r[0] for r in await cur.fetchall()]
            ids.extend(children)
            frontier = children
    return ids


async def set_media_tags(media_id: str, tag_names: list[str],
                         kind: str | None = None):
    """Replace media's tags with given names. Missing tags get created (kind inherited)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM media_tags WHERE media_id = ?", (media_id,))
        for name in tag_names:
            name = name.strip().lower().replace(" ", "-")[:40]
            if not name:
                continue
            cur = await db.execute("SELECT id FROM tags WHERE name = ?", (name,))
            row = await cur.fetchone()
            if row:
                tag_id = row[0]
            else:
                cur = await db.execute(
                    "INSERT INTO tags (name, parent_id, kind, created_at) "
                    "VALUES (?,?,?,?)",
                    (name, None, kind, _now()),
                )
                tag_id = cur.lastrowid
            await db.execute(
                "INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?,?)",
                (media_id, tag_id),
            )
        await db.commit()


async def get_media_tag_names(media_id: str) -> list[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            """SELECT t.name FROM tags t
               JOIN media_tags mt ON mt.tag_id = t.id
               WHERE mt.media_id = ?""",
            (media_id,),
        )
        return [r[0] for r in await cur.fetchall()]
