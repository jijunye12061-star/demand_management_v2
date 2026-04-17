#!/usr/bin/env python3
"""
migrate_researcher_note_submitted_at.py
---------------------------------------
新增 researcher_note / submitted_at 两列。

功能：
1. 备份数据库
2. 幂等 DDL：新增列（PRAGMA 检查后再 ALTER）
3. 回填 submitted_at = created_at（仅 NULL 行）
4. 验证：打印受影响行数

用法：
  python migrate_researcher_note_submitted_at.py            # 实际执行
  python migrate_researcher_note_submitted_at.py --dry-run  # 只预览
"""

import argparse
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVER_DIR / "data"
DB_PATH = DATA_DIR / "data.db"
BACKUP_PATH = DATA_DIR / f"data_backup_before_note_submitted_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"


def existing_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def run(dry_run: bool) -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] 数据库不存在: {DB_PATH}")
        return

    if dry_run:
        print("[DRY-RUN] 以下为预览，不会实际修改数据库")
    else:
        shutil.copy2(DB_PATH, BACKUP_PATH)
        print(f"[OK] 备份已保存至 {BACKUP_PATH}")

    conn = sqlite3.connect(DB_PATH)
    try:
        cols = existing_columns(conn, "requests")

        # ── DDL ───────────────────────────────────────────────────────────────
        if "researcher_note" not in cols:
            if dry_run:
                print("[DRY-RUN] 将执行: ALTER TABLE requests ADD COLUMN researcher_note TEXT")
            else:
                conn.execute("ALTER TABLE requests ADD COLUMN researcher_note TEXT")
                print("[OK] 新增列 researcher_note")
        else:
            print("[SKIP] researcher_note 列已存在")

        if "submitted_at" not in cols:
            if dry_run:
                print("[DRY-RUN] 将执行: ALTER TABLE requests ADD COLUMN submitted_at TEXT")
            else:
                conn.execute("ALTER TABLE requests ADD COLUMN submitted_at TEXT")
                print("[OK] 新增列 submitted_at")
        else:
            print("[SKIP] submitted_at 列已存在")

        # ── 回填 submitted_at ─────────────────────────────────────────────────
        if dry_run:
            print("[DRY-RUN] 将执行: UPDATE requests SET submitted_at = created_at WHERE submitted_at IS NULL")
        else:
            count_q = conn.execute(
                "SELECT COUNT(*) FROM requests WHERE submitted_at IS NULL"
            ).fetchone()[0]
            print(f"[INFO] 需回填 submitted_at 的行数: {count_q}")

        if not dry_run and count_q > 0:
            conn.execute(
                "UPDATE requests SET submitted_at = created_at WHERE submitted_at IS NULL"
            )
            print(f"[OK] 已回填 {count_q} 行 submitted_at = created_at")

        if not dry_run:
            conn.commit()

        # ── 验证 ───────────────────────────────────────────────────────────────
        if not dry_run:
            remaining = conn.execute(
                "SELECT COUNT(*) FROM requests WHERE submitted_at IS NULL"
            ).fetchone()[0]
            print(f"[验证] submitted_at 仍为 NULL 的行数: {remaining} (预期: 0)")

            sample = conn.execute(
                "SELECT id, created_at, submitted_at FROM requests LIMIT 5"
            ).fetchall()
            print("[验证] 前 5 行样本:")
            for row in sample:
                print(f"  id={row[0]}  created_at={row[1]}  submitted_at={row[2]}")

    finally:
        conn.close()

    if not dry_run:
        print("[完成] 迁移成功")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
