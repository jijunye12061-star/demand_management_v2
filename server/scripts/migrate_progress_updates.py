#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_progress_updates.py
----------------------------
P0 migration: create request_updates table

Functions:
1. Backup DB before migration (sqlite3.backup())
2. Idempotent DDL: create request_updates table if not exists
3. Idempotent indexes: idx_updates_request, idx_updates_user
4. Verify: print table info after migration

Usage:
  python migrate_progress_updates.py             # execute
  python migrate_progress_updates.py --dry-run   # preview only
"""

import argparse
import sqlite3
import shutil
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_DIR = SCRIPT_DIR.parent
DATA_DIR = SERVER_DIR / "data"
DB_PATH = DATA_DIR / "data.db"

CREATE_TABLE_SQL = """
CREATE TABLE request_updates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES requests(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    content     TEXT    NOT NULL,
    work_hours  REAL    NOT NULL DEFAULT 0,
    created_at  TEXT,
    updated_at  TEXT,
    is_deleted  INTEGER NOT NULL DEFAULT 0
)
""".strip()

INDEXES = [
    ("idx_updates_request", "CREATE INDEX IF NOT EXISTS idx_updates_request ON request_updates(request_id)"),
    ("idx_updates_user",    "CREATE INDEX IF NOT EXISTS idx_updates_user ON request_updates(user_id)"),
]


def log(msg):
    print(msg, flush=True)


def table_exists(cur, name):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None


def get_existing_indexes(cur, table):
    cur.execute("PRAGMA index_list({})".format(table))
    return {row[1] for row in cur.fetchall()}


def run_migration(conn, dry_run):
    cur = conn.cursor()

    log("\n[TABLE] Checking request_updates table...")
    if table_exists(cur, "request_updates"):
        log("  [OK] table 'request_updates' already exists, skip")
    else:
        log("  [+] CREATE TABLE request_updates")
        if not dry_run:
            cur.execute(CREATE_TABLE_SQL)

    log("\n[INDEX] Checking indexes...")
    if table_exists(cur, "request_updates") or not dry_run:
        existing_idx = set()
        if table_exists(cur, "request_updates"):
            existing_idx = get_existing_indexes(cur, "request_updates")
        for idx_name, idx_ddl in INDEXES:
            if idx_name in existing_idx:
                log("  [OK] index '{}' already exists, skip".format(idx_name))
            else:
                log("  [+] {}".format(idx_ddl))
                if not dry_run:
                    cur.execute(idx_ddl)

    if dry_run:
        log("\n[DRY-RUN] Preview only, nothing written.")
        return

    conn.commit()
    log("\n[COMMIT] Done.")

    log("\n[VERIFY] Post-migration check:")
    if table_exists(cur, "request_updates"):
        log("  [OK] table 'request_updates' exists")
        cur.execute("PRAGMA table_info(request_updates)")
        cols = cur.fetchall()
        log("  Columns:")
        for col in cols:
            log("    - {} ({})".format(col[1], col[2]))
    else:
        log("  [FAIL] table 'request_updates' missing!")

    for idx_name, _ in INDEXES:
        idx_set = get_existing_indexes(cur, "request_updates")
        if idx_name in idx_set:
            log("  [OK] index '{}' exists".format(idx_name))
        else:
            log("  [FAIL] index '{}' missing!".format(idx_name))

    log("\n[DONE] Migration complete.")


def main():
    parser = argparse.ArgumentParser(description="Progress updates migration: create request_updates table")
    parser.add_argument("--dry-run", action="store_true", help="preview only, no writes")
    parser.add_argument("--db", default=str(DB_PATH), help="DB path (default: {})".format(DB_PATH))
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        log("[ERROR] DB not found: {}".format(db_path))
        sys.exit(1)

    log("DB path : {}".format(db_path))
    log("Mode    : {}".format("DRY-RUN" if args.dry_run else "EXECUTE"))

    backup_dir = db_path.parent
    backup_path = backup_dir / "data_backup_before_progress_updates.db"

    if backup_path.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        extra = backup_dir / "data_backup_before_progress_updates_{}.db".format(ts)
        shutil.copy2(backup_path, extra)
        log("Old backup saved as: {}".format(extra.name))

    log("Backup  : {}".format(backup_path))
    src_conn = sqlite3.connect(str(db_path))
    dst_conn = sqlite3.connect(str(backup_path))
    src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()
    log("Backup done.\n")

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        run_migration(conn, dry_run=args.dry_run)
    except Exception as e:
        conn.rollback()
        log("\n[ERROR] Migration failed, rolled back: {}".format(e))
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
