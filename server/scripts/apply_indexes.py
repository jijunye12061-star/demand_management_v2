"""Apply recommended indexes from database.md"""
import sqlite3
import sys

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status)",
    "CREATE INDEX IF NOT EXISTS idx_req_sales ON requests(sales_id)",
    "CREATE INDEX IF NOT EXISTS idx_req_researcher ON requests(researcher_id)",
    "CREATE INDEX IF NOT EXISTS idx_req_created_at ON requests(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_req_confidential ON requests(is_confidential)",
    "CREATE INDEX IF NOT EXISTS idx_dl_time ON download_logs(downloaded_at)",
    "CREATE INDEX IF NOT EXISTS idx_dl_request ON download_logs(request_id)",
    "CREATE INDEX IF NOT EXISTS idx_dl_user ON download_logs(user_id)",
]


def apply_indexes(db_path: str = "data/data.db"):
    conn = sqlite3.connect(db_path)
    for sql in INDEXES:
        conn.execute(sql)
        print(f"✅ {sql.split('idx_')[1].split(' ')[0]}")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    apply_indexes(path)
