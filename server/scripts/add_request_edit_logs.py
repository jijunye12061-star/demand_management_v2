"""幂等建表: request_edit_logs"""
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "data.db"


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='request_edit_logs'")
    if cur.fetchone():
        print("表 request_edit_logs 已存在，跳过")
        conn.close()
        return
    cur.execute("""
        CREATE TABLE request_edit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL REFERENCES requests(id),
            editor_id INTEGER NOT NULL REFERENCES users(id),
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            edited_at TEXT
        )
    """)
    conn.commit()
    print("表 request_edit_logs 创建成功")
    conn.close()


if __name__ == "__main__":
    sys.exit(main())
