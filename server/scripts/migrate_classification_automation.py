#!/usr/bin/env python3
"""
migrate_classification_automation.py
-------------------------------------
P0 迁移脚本：需求分类体系重构 + 自动化工作量管理字段

功能：
1. 备份数据库（执行前，sqlite3.backup()）
2. 幂等 DDL：新增 automation_hours、parent_request_id 列
3. 存量数据映射：request_type / research_scope 旧值 → 新值
4. 验证：迁移后打印 DISTINCT 值确认无旧值残留

用法：
  python migrate_classification_automation.py             # 实际执行
  python migrate_classification_automation.py --dry-run   # 只预览影响行数
"""

import argparse
import sqlite3
import shutil
import sys
from datetime import datetime
from pathlib import Path

# ── 路径配置 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVER_DIR / "data"
DB_PATH = DATA_DIR / "data.db"
BACKUP_PATH = DATA_DIR / "data_backup_before_ca_migration.db"

# ── 存量映射表 ─────────────────────────────────────────────────────────────────
REQUEST_TYPE_MAPPINGS = [
    # (旧值, 新值)
    ("传统报告定制", "报告定制"),
    ("量化策略定制", "量化策略开发"),
    ("系统定制",     "工具/系统开发"),
    ("综合暂时兜底", "其他"),
    ("外出调研",     "调研"),   # 存量数据实际存在，合理归入调研
]

RESEARCH_SCOPE_MAPPINGS = [
    # (旧值, 新值)
    ("其他",         "综合/行业"),
    ("其他(11)",     "综合/行业"),   # 存量脏数据
    ("其他(123)",    "综合/行业"),   # 存量脏数据
    ("固收＋",       "固收+"),       # 全角加号 → 半角
]

# 新增 DDL 列定义
NEW_COLUMNS = [
    ("automation_hours",   "REAL DEFAULT NULL"),
    ("parent_request_id",  "INTEGER DEFAULT NULL REFERENCES requests(id)"),
]


def log(msg: str):
    print(msg, flush=True)


def get_existing_columns(cur: sqlite3.Cursor, table: str) -> set[str]:
    cur.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def count_affected(cur: sqlite3.Cursor, column: str, old_value: str) -> int:
    cur.execute(
        f"SELECT COUNT(*) FROM requests WHERE {column} = ?", (old_value,)
    )
    return cur.fetchone()[0]


def run_migration(conn: sqlite3.Connection, dry_run: bool):
    cur = conn.cursor()

    # ── 1. DDL：幂等添加新列 ────────────────────────────────────────────────
    log("\n[DDL] 检查并添加新列...")
    existing = get_existing_columns(cur, "requests")

    for col_name, col_def in NEW_COLUMNS:
        if col_name in existing:
            log(f"  ✓ 列 {col_name!r} 已存在，跳过")
        else:
            ddl = f"ALTER TABLE requests ADD COLUMN {col_name} {col_def}"
            log(f"  + 添加列: {ddl}")
            if not dry_run:
                cur.execute(ddl)

    # ── 2. 存量映射 ──────────────────────────────────────────────────────────
    log("\n[DATA] 需求类型 (request_type) 映射预览：")
    for old_val, new_val in REQUEST_TYPE_MAPPINGS:
        n = count_affected(cur, "request_type", old_val)
        log(f"  '{old_val}' → '{new_val}' : {n} 条")
        if not dry_run and n > 0:
            cur.execute(
                "UPDATE requests SET request_type = ? WHERE request_type = ?",
                (new_val, old_val),
            )

    log("\n[DATA] 研究范围 (research_scope) 映射预览：")
    for old_val, new_val in RESEARCH_SCOPE_MAPPINGS:
        n = count_affected(cur, "research_scope", old_val)
        log(f"  '{old_val}' → '{new_val}' : {n} 条")
        if not dry_run and n > 0:
            cur.execute(
                "UPDATE requests SET research_scope = ? WHERE research_scope = ?",
                (new_val, old_val),
            )

    if dry_run:
        log("\n[DRY-RUN] 以上为预览，未写入任何数据。")
        return

    conn.commit()
    log("\n[COMMIT] 数据已提交。")

    # ── 3. 验证 ──────────────────────────────────────────────────────────────
    log("\n[VERIFY] 迁移后 DISTINCT 值：")

    cur.execute("SELECT DISTINCT request_type FROM requests ORDER BY request_type")
    types = [r[0] for r in cur.fetchall()]
    log(f"  request_type: {types}")

    cur.execute("SELECT DISTINCT research_scope FROM requests ORDER BY research_scope")
    scopes = [r[0] for r in cur.fetchall()]
    log(f"  research_scope: {scopes}")

    # 校验无旧值残留
    old_request_types = {old for old, _ in REQUEST_TYPE_MAPPINGS}
    old_research_scopes = {old for old, _ in RESEARCH_SCOPE_MAPPINGS}

    leaked_rt = set(types) & old_request_types
    leaked_rs = set(scopes) & old_research_scopes

    if leaked_rt:
        log(f"\n[WARN] request_type 仍有旧值残留: {leaked_rt}")
    if leaked_rs:
        log(f"\n[WARN] research_scope 仍有旧值残留: {leaked_rs}")
    if not leaked_rt and not leaked_rs:
        log("\n[OK] 验证通过：无旧值残留。")

    # 验证新列存在且默认 NULL
    cur.execute("SELECT automation_hours, parent_request_id FROM requests LIMIT 1")
    row = cur.fetchone()
    log(f"  新列样本值（第1行）: automation_hours={row[0]}, parent_request_id={row[1]}")
    log("\n[DONE] 迁移完成。")


def main():
    parser = argparse.ArgumentParser(description="CA 迁移脚本（分类体系重构 + 自动化字段）")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只预览影响行数，不执行任何写操作",
    )
    parser.add_argument(
        "--db",
        default=str(DB_PATH),
        help=f"数据库路径（默认: {DB_PATH}）",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        log(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)

    log(f"数据库路径  : {db_path}")
    log(f"模式        : {'DRY-RUN（预览）' if args.dry_run else '实际执行'}")

    # ── 备份 ─────────────────────────────────────────────────────────────────
    # dry-run 也做备份，保证任何时候运行前都有快照
    backup_dir = db_path.parent
    backup_path = backup_dir / "data_backup_before_ca_migration.db"

    if backup_path.exists():
        # 保留历史备份，追加时间戳副本
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        extra = backup_dir / f"data_backup_before_ca_migration_{ts}.db"
        shutil.copy2(backup_path, extra)
        log(f"备份已存在，旧备份另存为: {extra.name}")

    log(f"备份到      : {backup_path}")
    src_conn = sqlite3.connect(str(db_path))
    dst_conn = sqlite3.connect(str(backup_path))
    src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()
    log("备份完成。\n")

    # ── 执行迁移 ──────────────────────────────────────────────────────────────
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        run_migration(conn, dry_run=args.dry_run)
    except Exception as e:
        conn.rollback()
        log(f"\n[ERROR] 迁移异常，已回滚: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
