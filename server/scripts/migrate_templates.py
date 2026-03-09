"""迁移脚本: 为已有 request_templates 表补充 usage_count / updated_at / is_deleted 列 (幂等)"""
import sqlite3
import sys
from pathlib import Path

COLUMNS_TO_ADD = [
    ("usage_count", "ALTER TABLE request_templates ADD COLUMN usage_count INTEGER DEFAULT 0"),
    ("updated_at",  "ALTER TABLE request_templates ADD COLUMN updated_at TIMESTAMP"),
    ("is_deleted",  "ALTER TABLE request_templates ADD COLUMN is_deleted INTEGER DEFAULT 0"),
]


def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='request_templates'")
    if not cur.fetchone():
        print("❌ request_templates 表不存在, 请先确认数据库")
        conn.close()
        return

    cur.execute("PRAGMA table_info(request_templates)")
    existing = {row[1] for row in cur.fetchall()}

    added = []
    for col_name, alter_sql in COLUMNS_TO_ADD:
        if col_name in existing:
            continue
        cur.execute(alter_sql)
        added.append(col_name)

    conn.commit()
    conn.close()

    if added:
        print(f"✅ 新增列: {', '.join(added)}")
    else:
        print("✅ 所有列已存在, 无需迁移")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parent.parent / "data" / "data.db")
    print(f"目标数据库: {db}")
    migrate(db)