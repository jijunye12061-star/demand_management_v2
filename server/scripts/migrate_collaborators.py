"""
Collaborators migration: add request_collaborators table and indexes.
Idempotent — safe to run multiple times.
"""
import sqlite3
import sys
from pathlib import Path


def get_tables(cursor) -> set[str]:
    return {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def get_indexes(cursor) -> set[str]:
    return {row[1] for row in cursor.execute("SELECT * FROM sqlite_master WHERE type='index'")}


def migrate(db_path: str = "data/data.db"):
    if not Path(db_path).exists():
        print(f"[warn] {db_path} 不存在, 跳过迁移 (请先运行 seed_data.py)")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # --- 创建 request_collaborators 表 ---
    tables = get_tables(cursor)
    if "request_collaborators" not in tables:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS request_collaborators (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id    INTEGER NOT NULL REFERENCES requests(id),
                user_id       INTEGER NOT NULL REFERENCES users(id),
                work_hours    REAL DEFAULT 0,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("[OK] 创建表: request_collaborators")
    else:
        print("[skip] request_collaborators 已存在")

    # --- 创建索引 ---
    existing = get_indexes(cursor)
    indexes = [
        ("idx_collab_request", "CREATE INDEX IF NOT EXISTS idx_collab_request ON request_collaborators(request_id)"),
        ("idx_collab_user",    "CREATE INDEX IF NOT EXISTS idx_collab_user ON request_collaborators(user_id)"),
    ]
    for name, sql in indexes:
        if name not in existing:
            cursor.execute(sql)
            print(f"[OK] 索引: {name}")
        else:
            print(f"[skip] 索引 {name} 已存在")

    conn.commit()
    conn.close()
    print(f"\n[done] 迁移完成: {db_path}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    migrate(path)
