"""
Unified v3 migration: password_version, withdraw_reason, performance indexes.
Idempotent — safe to run multiple times.
"""
import sqlite3
import sys
from pathlib import Path


def get_columns(cursor, table: str) -> set[str]:
    return {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}


def get_indexes(cursor) -> set[str]:
    return {row[1] for row in cursor.execute("SELECT * FROM sqlite_master WHERE type='index'")}


def migrate(db_path: str = "data/data.db"):
    if not Path(db_path).exists():
        print(f"⚠️  {db_path} 不存在, 跳过迁移 (请先运行 seed_data.py)")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # --- Column migrations ---
    user_cols = get_columns(cursor, "users")
    if "password_version" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1")
        print("✅ users: 新增 password_version (default=1, SHA256 legacy)")
    else:
        print("ℹ️  users.password_version 已存在")

    req_cols = get_columns(cursor, "requests")
    if "withdraw_reason" not in req_cols:
        cursor.execute("ALTER TABLE requests ADD COLUMN withdraw_reason TEXT")
        print("✅ requests: 新增 withdraw_reason")
    else:
        print("ℹ️  requests.withdraw_reason 已存在")

    # --- Performance indexes (database.md §4) ---
    existing = get_indexes(cursor)
    indexes = [
        ("idx_req_status", "CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status)"),
        ("idx_req_sales", "CREATE INDEX IF NOT EXISTS idx_req_sales ON requests(sales_id)"),
        ("idx_req_researcher", "CREATE INDEX IF NOT EXISTS idx_req_researcher ON requests(researcher_id)"),
        ("idx_req_created_at", "CREATE INDEX IF NOT EXISTS idx_req_created_at ON requests(created_at)"),
        ("idx_req_confidential", "CREATE INDEX IF NOT EXISTS idx_req_confidential ON requests(is_confidential)"),
        ("idx_dl_request", "CREATE INDEX IF NOT EXISTS idx_dl_request ON download_logs(request_id)"),
        ("idx_dl_user", "CREATE INDEX IF NOT EXISTS idx_dl_user ON download_logs(user_id)"),
        ("idx_dl_time", "CREATE INDEX IF NOT EXISTS idx_dl_time ON download_logs(downloaded_at)"),
    ]
    for name, sql in indexes:
        if name not in existing:
            cursor.execute(sql)
            print(f"✅ 索引: {name}")

    conn.commit()
    conn.close()
    print(f"\n🎉 迁移完成: {db_path}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    migrate(path)