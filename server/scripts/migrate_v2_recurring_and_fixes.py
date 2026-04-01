#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_v2_recurring_and_fixes.py
------------------------------------
v2 修补迁移脚本

功能：
1. 备份数据库
2. 数据修复：
   - 调研二级分类改名：线上调研→线上独家调研、线下调研→线下专访调研
   - 研究范围改名：量化→量化及指增（requests + request_templates）
   - visibility='internal' → is_confidential=1（如原本不是保密的话）
3. 幂等 DDL：request_templates 表新增定期调度字段

用法：
  python migrate_v2_recurring_and_fixes.py             # 实际执行
  python migrate_v2_recurring_and_fixes.py --dry-run   # 只预览，不写入
"""

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVER_DIR / "data"
BACKUP_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "data.db"

# request_templates 新增定期调度字段（幂等 DDL）
TEMPLATE_NEW_COLUMNS = [
    ("is_recurring",      "INTEGER DEFAULT 0"),
    ("recurrence_type",   "TEXT"),
    ("recurrence_day",    "INTEGER"),
    ("next_due_date",     "TEXT"),
    ("last_triggered_at", "TEXT"),
    ("is_active",         "INTEGER DEFAULT 1"),
]


def get_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r[1] for r in rows}


def backup_db(dry_run: bool) -> Path | None:
    if dry_run:
        print("[DRY-RUN] 跳过备份")
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = BACKUP_DIR / f"data_before_v2_fixes_{ts}.db"
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(bak))
    src.backup(dst)
    dst.close()
    src.close()
    print(f"[备份] → {bak.name}")
    return bak


def run(dry_run: bool):
    print(f"=== v2 数据修补迁移 {'[DRY-RUN]' if dry_run else ''} ===\n")

    backup_db(dry_run)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    try:
        # ── 1. 调研二级分类改名 ──────────────────────────────────────────────
        print("── 1. 调研二级分类改名 ──")

        cnt = conn.execute(
            "SELECT COUNT(*) FROM requests WHERE sub_type = '线上调研'"
        ).fetchone()[0]
        print(f"  线上调研 → 线上独家调研: {cnt} 条")
        if not dry_run:
            conn.execute(
                "UPDATE requests SET sub_type = '线上独家调研' WHERE sub_type = '线上调研'"
            )

        cnt = conn.execute(
            "SELECT COUNT(*) FROM requests WHERE sub_type = '线下调研'"
        ).fetchone()[0]
        print(f"  线下调研 → 线下专访调研: {cnt} 条")
        if not dry_run:
            conn.execute(
                "UPDATE requests SET sub_type = '线下专访调研' WHERE sub_type = '线下调研'"
            )

        # ── 2. 研究范围改名 ──────────────────────────────────────────────────
        print("\n── 2. 研究范围改名 ──")

        cnt = conn.execute(
            "SELECT COUNT(*) FROM requests WHERE research_scope = '量化'"
        ).fetchone()[0]
        print(f"  requests: 量化 → 量化及指增: {cnt} 条")
        if not dry_run:
            conn.execute(
                "UPDATE requests SET research_scope = '量化及指增' WHERE research_scope = '量化'"
            )

        cnt = conn.execute(
            "SELECT COUNT(*) FROM request_templates WHERE research_scope = '量化'"
        ).fetchone()[0]
        print(f"  request_templates: 量化 → 量化及指增: {cnt} 条")
        if not dry_run:
            conn.execute(
                "UPDATE request_templates SET research_scope = '量化及指增' WHERE research_scope = '量化'"
            )

        # ── 3. visibility='internal' → is_confidential=1 ─────────────────────
        print("\n── 3. visibility → is_confidential 迁移 ──")

        existing_cols = get_columns(conn, "requests")
        if "visibility" in existing_cols:
            cnt = conn.execute(
                "SELECT COUNT(*) FROM requests WHERE visibility = 'internal' AND is_confidential = 0"
            ).fetchone()[0]
            print(f"  visibility=internal 且未保密 → 设置保密: {cnt} 条")
            if not dry_run:
                conn.execute(
                    "UPDATE requests SET is_confidential = 1 WHERE visibility = 'internal' AND is_confidential = 0"
                )
        else:
            print("  visibility 列不存在，跳过")

        # ── 4. request_templates 新增定期调度字段（幂等） ─────────────────────
        print("\n── 4. request_templates 新增定期调度字段 ──")

        existing_tmpl_cols = get_columns(conn, "request_templates")
        for col_name, col_def in TEMPLATE_NEW_COLUMNS:
            if col_name in existing_tmpl_cols:
                print(f"  已存在: {col_name}，跳过")
            else:
                print(f"  新增列: {col_name} {col_def}")
                if not dry_run:
                    conn.execute(
                        f"ALTER TABLE request_templates ADD COLUMN {col_name} {col_def}"
                    )

        if not dry_run:
            conn.commit()
            print("\n[COMMIT] 变更已写入")
        else:
            print("\n[DRY-RUN] 未写入，回滚")
            conn.rollback()

        # ── 5. 验证 ─────────────────────────────────────────────────────────
        print("\n── 验证 ──")

        rows = conn.execute(
            "SELECT DISTINCT sub_type FROM requests WHERE request_type = '调研' ORDER BY sub_type"
        ).fetchall()
        print(f"  调研 sub_type DISTINCT: {[r[0] for r in rows]}")

        rows = conn.execute(
            "SELECT DISTINCT research_scope FROM requests ORDER BY research_scope"
        ).fetchall()
        print(f"  requests research_scope DISTINCT: {[r[0] for r in rows]}")

        tmpl_cols = get_columns(conn, "request_templates")
        recurring_cols = [c for c in ["is_recurring", "recurrence_type", "recurrence_day",
                                       "next_due_date", "last_triggered_at", "is_active"]
                          if c in tmpl_cols]
        print(f"  request_templates 定期字段: {recurring_cols}")

    finally:
        conn.close()

    print("\n=== 迁移完成 ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="v2 数据修补迁移脚本")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不写入")
    args = parser.parse_args()
    run(args.dry_run)
