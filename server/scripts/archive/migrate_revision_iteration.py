#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_revision_iteration.py
------------------------------
P0 migration: revision-iteration fields

Functions:
1. Backup DB before migration (sqlite3.backup())
2. Idempotent DDL: add link_type column (parent_request_id already exists)
3. Idempotent index: create idx_req_parent
4. Verify: print new fields after migration

Usage:
  python migrate_revision_iteration.py             # execute
  python migrate_revision_iteration.py --dry-run   # preview only
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

NEW_COLUMNS = [
    ("link_type", "TEXT DEFAULT NULL"),
]


def log(msg):
    print(msg, flush=True)


def get_existing_columns(cur, table):
    cur.execute("PRAGMA table_info({})".format(table))
    return {row[1] for row in cur.fetchall()}


def get_existing_indexes(cur, table):
    cur.execute("PRAGMA index_list({})".format(table))
    return {row[1] for row in cur.fetchall()}


def run_migration(conn, dry_run):
    cur = conn.cursor()

    log("\n[DDL] Checking columns...")
    existing_cols = get_existing_columns(cur, "requests")

    if "parent_request_id" in existing_cols:
        log("  [OK] column 'parent_request_id' already exists, skip")
    else:
        log("  [!!] column 'parent_request_id' missing (unexpected)")

    for col_name, col_def in NEW_COLUMNS:
        if col_name in existing_cols:
            log("  [OK] column '{}' already exists, skip".format(col_name))
        else:
            ddl = "ALTER TABLE requests ADD COLUMN {} {}".format(col_name, col_def)
            log("  [+] {}".format(ddl))
            if not dry_run:
                cur.execute(ddl)

    log("\n[INDEX] Checking indexes...")
    existing_idx = get_existing_indexes(cur, "requests")

    if "idx_req_parent" in existing_idx:
        log("  [OK] index 'idx_req_parent' already exists, skip")
    else:
        idx_ddl = "CREATE INDEX IF NOT EXISTS idx_req_parent ON requests(parent_request_id)"
        log("  [+] {}".format(idx_ddl))
        if not dry_run:
            cur.execute(idx_ddl)

    if dry_run:
        log("\n[DRY-RUN] Preview only, nothing written.")
        log("\nCurrent columns in requests:")
        for col in sorted(existing_cols):
            log("  - {}".format(col))
        return

    conn.commit()
    log("\n[COMMIT] Done.")

    log("\n[VERIFY] Post-migration check:")
    final_cols = get_existing_columns(cur, "requests")

    for col_name, _ in NEW_COLUMNS:
        if col_name in final_cols:
            log("  [OK] column '{}' exists".format(col_name))
        else:
            log("  [FAIL] column '{}' missing!".format(col_name))

    if "idx_req_parent" in get_existing_indexes(cur, "requests"):
        log("  [OK] index 'idx_req_parent' exists")
    else:
        log("  [FAIL] index 'idx_req_parent' missing!")

    cur.execute("SELECT id, parent_request_id, link_type FROM requests LIMIT 3")
    rows = cur.fetchall()
    if rows:
        log("\n  Sample rows (up to 3):")
        for row in rows:
            log("    id={}, parent_request_id={}, link_type={}".format(row[0], row[1], row[2]))

    log("\n[DONE] Migration complete.")


def main():
    parser = argparse.ArgumentParser(description="RI migration: revision-iteration fields")
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
    backup_path = backup_dir / "data_backup_before_ri_migration.db"

    if backup_path.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        extra = backup_dir / "data_backup_before_ri_migration_{}.db".format(ts)
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
