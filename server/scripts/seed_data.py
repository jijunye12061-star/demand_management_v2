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
    withdraw_reason TEXT,
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


def create_sample_attachment(upload_dir: Path, request_id: int, filename: str, content: str) -> str:
    """创建模拟附件，返回相对路径 (uploads/{request_id}/{filename})"""
    dest = upload_dir / str(request_id)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / filename).write_text(content, encoding="utf-8")
    return f"uploads/{request_id}/{filename}"


def seed(db_path: str = "data/data.db"):
    base = Path(db_path).parent
    base.mkdir(parents=True, exist_ok=True)
    upload_dir = base / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (base / "backups").mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    # --- Teams ---
    conn.execute("INSERT OR IGNORE INTO teams (id, name) VALUES (1, '华东团队')")
    conn.execute("INSERT OR IGNORE INTO teams (id, name) VALUES (2, '华南团队')")

    # --- Organizations ---
    orgs = [
        (1, "招商银行", "银行"), (2, "中信证券", "券商"), (3, "平安保险", "保险"),
        (4, "建信理财", "理财"), (5, "嘉实基金FOF", "FOF"),
    ]
    for oid, name, otype in orgs:
        conn.execute("INSERT OR IGNORE INTO organizations (id, name, org_type) VALUES (?, ?, ?)", (oid, name, otype))

    # --- Team-Org mapping ---
    for org_id in [1, 2, 3]:
        conn.execute("INSERT OR IGNORE INTO team_org_mapping (team_id, org_id) VALUES (1, ?)", (org_id,))
    for org_id in [3, 4, 5]:
        conn.execute("INSERT OR IGNORE INTO team_org_mapping (team_id, org_id) VALUES (2, ?)", (org_id,))

    # --- Users (SHA256, password=123456) ---
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

    # --- 模拟附件 ---
    att1 = create_sample_attachment(upload_dir, 1, "招行固收+筛选结果.csv",
        "基金名称,基金代码,近一年收益,最大回撤\n"
        "招商产业债A,217022,4.52%,-1.23%\n"
        "招商双债增强A,161716,3.87%,-2.15%\n"
        "招商安泰债券A,217003,5.11%,-0.98%\n"
    )
    att4 = create_sample_attachment(upload_dir, 4, "建信理财配置方案v2.txt",
        "=== 建信理财 2025Q1 资产配置方案 ===\n\n"
        "一、宏观判断\n  经济复苏态势延续，利率中枢下行空间有限。\n\n"
        "二、配置建议\n  固收类: 60% (短久期利率债+高等级信用债)\n"
        "  权益类: 25% (沪深300 + 中证500)\n"
        "  另类: 15% (黄金 + REITs)\n\n"
        "三、风险提示\n  关注美联储政策转向及国内地产链修复节奏。\n"
    )

    # --- Requests ---
    requests_data = [
        ("招行固收+产品筛选", "筛选适合招行金市部的固收+产品", "基金筛选", "固收+", "招商银行", "银行", "金市",
         2, 4, "completed", 2.5, None, att1, 0,
         "2025-01-15 10:00:00", "2025-01-16 14:00:00", "已完成筛选，共3只基金符合条件"),

        ("中信自营量化策略", "定制中信自营部门的量化因子策略", "量化策略定制", "量化", "中信证券", "券商", "自营",
         2, 4, "in_progress", 0, None, None, 0,
         "2025-02-01 09:00:00", None, None),

        ("平安资管报告", "平安资管部年度权益市场回顾报告", "传统报告定制", "权益", "平安保险", "保险", "资管",
         3, 5, "pending", 0, None, None, 0,
         "2025-02-10 11:00:00", None, None),

        ("建信理财配置方案", "2025Q1 建信理财大类资产配置建议", "系统定制", "资产配置", "建信理财", "理财", None,
         3, 5, "completed", 4.0, None, att4, 0,
         "2025-01-20 08:00:00", "2025-01-22 16:00:00", "配置方案已交付，含固收/权益/另类三大板块"),

        ("嘉实FOF研究", "FOF组合构建方法论研究", "综合暂时兜底", "其他", "嘉实基金FOF", "FOF", None,
         3, 4, "pending", 0, None, None, 0,
         "2025-02-15 14:00:00", None, None),

        ("退回测试需求", "招行资管部纯债策略定制(数据不足)", "传统报告定制", "纯债", "招商银行", "银行", "资管",
         2, 4, "withdrawn", 0, "数据不完整，请补充招行的持仓明细", None, 0,
         "2025-02-20 09:00:00", None, None),

        ("保密需求测试", "某银行专属定制（保密）", "基金筛选", "固收+", "招商银行", "银行", "金市",
         2, 4, "pending", 0, None, None, 1,
         "2025-02-25 10:00:00", None, None),
    ]

    for i, (title, desc, rtype, scope, org, otype, dept, sid, rid, st, hrs, reason, att, conf, cat, comp, note) in enumerate(requests_data, 1):
        conn.execute(
            """INSERT OR IGNORE INTO requests
            (id, title, description, request_type, research_scope, org_name, org_type, department,
             sales_id, researcher_id, status, work_hours, withdraw_reason, attachment_path,
             is_confidential, created_by, created_at, completed_at, result_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (i, title, desc, rtype, scope, org, otype, dept, sid, rid, st, hrs, reason, att, conf, sid, cat, comp, note),
        )

    # --- Download logs (测试下载追踪) ---
    logs = [
        (1, 2, "招商银行", "2025-01-17 09:30:00"),   # sales1 下载需求1
        (1, 3, "平安保险", "2025-01-18 14:00:00"),   # sales2 交叉下载需求1
        (1, 4, None, "2025-01-17 10:00:00"),          # researcher1 下载
        (4, 3, "建信理财", "2025-01-23 09:00:00"),   # sales2 下载需求4
        (4, 1, None, "2025-01-23 11:00:00"),          # admin 下载需求4
    ]
    for req_id, uid, org, dt in logs:
        conn.execute(
            "INSERT OR IGNORE INTO download_logs (request_id, user_id, org_name, downloaded_at) VALUES (?, ?, ?, ?)",
            (req_id, uid, org, dt),
        )

    conn.commit()
    conn.close()

    print(f"✅ Seeded {db_path}:")
    print(f"   - 5 users (password: 123456)")
    print(f"   - {len(requests_data)} requests (2 with attachments, 1 withdrawn, 1 confidential)")
    print(f"   - {len(logs)} download logs")
    print(f"   - 2 sample files in {upload_dir}/")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    seed(path)