"""Create a test database with sample data for development."""
import sqlite3
import hashlib
import sys
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    org_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_org_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, org_id)
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    display_name TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_version INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    request_type TEXT NOT NULL,
    research_scope TEXT,
    org_name TEXT NOT NULL,
    org_type TEXT,
    department TEXT,
    sales_id INTEGER NOT NULL REFERENCES users(id),
    researcher_id INTEGER REFERENCES users(id),
    is_confidential INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    result_note TEXT,
    attachment_path TEXT,
    work_hours REAL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS download_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    org_name TEXT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def seed(db_path: str = "data/data.db"):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)

    # Create tables
    conn.executescript(SCHEMA)

    # Teams
    conn.execute("INSERT OR IGNORE INTO teams (id, name) VALUES (1, '华东团队')")
    conn.execute("INSERT OR IGNORE INTO teams (id, name) VALUES (2, '华南团队')")

    # Organizations
    orgs = [
        (1, "招商银行", "银行"), (2, "中信证券", "券商"), (3, "平安保险", "保险"),
        (4, "建信理财", "理财"), (5, "嘉实基金FOF", "FOF"),
    ]
    for oid, name, otype in orgs:
        conn.execute("INSERT OR IGNORE INTO organizations (id, name, org_type) VALUES (?, ?, ?)", (oid, name, otype))

    # Team-Org mapping
    for org_id in [1, 2, 3]:
        conn.execute("INSERT OR IGNORE INTO team_org_mapping (team_id, org_id) VALUES (1, ?)", (org_id,))
    for org_id in [3, 4, 5]:
        conn.execute("INSERT OR IGNORE INTO team_org_mapping (team_id, org_id) VALUES (2, ?)", (org_id,))

    # Users (SHA256 passwords: password=123456)
    pwd = sha256("123456")
    users = [
        (1, "admin", pwd, "admin", "管理员", None, 1),
        (2, "sales1", pwd, "sales", "张销售", 1, 1),
        (3, "sales2", pwd, "sales", "李销售", 2, 1),
        (4, "researcher1", pwd, "researcher", "王研究", None, 1),
        (5, "researcher2", pwd, "researcher", "赵研究", None, 1),
    ]
    for uid, uname, upwd, role, dname, tid, pv in users:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, username, password, role, display_name, team_id, password_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, uname, upwd, role, dname, tid, pv),
        )

    # Sample requests
    requests_data = [
        ("招行固收+产品筛选", "基金筛选", "固收+", "招商银行", "银行", "金市", 2, 4, "completed", 2.5, "2025-01-15 10:00:00", "2025-01-16 14:00:00"),
        ("中信自营量化策略", "量化策略定制", "量化", "中信证券", "券商", "自营", 2, 4, "in_progress", 0, "2025-02-01 09:00:00", None),
        ("平安资管报告", "传统报告定制", "权益", "平安保险", "保险", "资管", 3, 5, "pending", 0, "2025-02-10 11:00:00", None),
        ("建信理财配置方案", "系统定制", "资产配置", "建信理财", "理财", None, 3, 5, "completed", 4.0, "2025-01-20 08:00:00", "2025-01-22 16:00:00"),
        ("嘉实FOF研究", "综合暂时兜底", "其他", "嘉实基金FOF", "FOF", None, 3, 4, "pending", 0, "2025-02-15 14:00:00", None),
    ]
    for i, (title, rtype, scope, org, otype, dept, sid, rid, st, hrs, cat, comp) in enumerate(requests_data, 1):
        conn.execute(
            """INSERT OR IGNORE INTO requests
            (id, title, request_type, research_scope, org_name, org_type, department,
             sales_id, researcher_id, status, work_hours, created_by, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (i, title, rtype, scope, org, otype, dept, sid, rid, st, hrs, sid, cat, comp),
        )

    conn.commit()
    conn.close()
    print(f"✅ Seeded {db_path} with test data")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    seed(path)
