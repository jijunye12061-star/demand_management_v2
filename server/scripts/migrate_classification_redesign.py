#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_classification_redesign.py
------------------------------------
分类体系重构迁移脚本

功能：
1. 备份数据库（sqlite3.backup()，事务开始前执行）
2. 幂等 DDL：requests / request_templates 表新增 sub_type、work_mode、visibility 列
3. 存量数据映射（先映射 sub_type，再映射 request_type，最后设置 work_mode / visibility）
4. 表重建：去掉 is_self_initiated 列，org_name/sales_id 变为 nullable
5. 验证：打印各字段 DISTINCT 值
6. 支持 --dry-run 参数

用法：
  python migrate_classification_redesign.py             # 实际执行
  python migrate_classification_redesign.py --dry-run   # 只预览，不写入
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
BACKUP_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "data.db"

# ── 新增列定义（幂等 DDL） ────────────────────────────────────────────────────
NEW_COLUMNS = [
    ("sub_type",    "TEXT"),
    ("work_mode",   "TEXT DEFAULT 'service'"),
    ("visibility",  "TEXT DEFAULT 'public'"),
]

# ── 映射表 ────────────────────────────────────────────────────────────────────

# 步骤 3a：sub_type 映射（基于原始 request_type）
SUB_TYPE_MAPPINGS = [
    # (request_type, sub_type)
    ("报告定制",       "定制报告"),
    ("量化策略开发",   "系统建设"),
    ("工具/系统开发",  "系统建设"),
    ("其他",           "其他"),
    # 调研、基金筛选、定期报告 → sub_type=NULL（不处理）
]

# 步骤 3b：request_type 重命名
REQUEST_TYPE_MAPPINGS = [
    # (旧值, 新值)
    ("报告定制",       "专项报告"),
    ("量化策略开发",   "内部项目"),
    ("工具/系统开发",  "内部项目"),
    ("其他",           "内部项目"),
    # 调研、基金筛选、定期报告 保持不变
]

# 步骤 4a：work_mode 设置（用映射后的 request_type 值）
WORK_MODE_PROACTIVE_TYPES = ("调研", "定期报告", "内部项目")
WORK_MODE_SERVICE_TYPES   = ("基金筛选", "专项报告")

# 步骤 4b：visibility 设置
VISIBILITY_INTERNAL_TYPES = ("内部项目",)


def log(msg: str):
    print(msg, flush=True)


def get_existing_columns(cur: sqlite3.Cursor, table: str) -> set:
    cur.execute("PRAGMA table_info({})".format(table))
    return {row[1] for row in cur.fetchall()}


def get_table_indexes(cur: sqlite3.Cursor, table: str) -> list:
    """返回非系统索引的 (name, sql) 列表"""
    cur.execute(
        "SELECT name, sql FROM sqlite_master "
        "WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%'",
        (table,),
    )
    return cur.fetchall()


def step_add_columns(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """幂等添加 NEW_COLUMNS 到指定表"""
    existing = get_existing_columns(cur, table)
    for col_name, col_def in NEW_COLUMNS:
        if col_name in existing:
            log("  [OK] {}.{} 已存在，跳过".format(table, col_name))
        else:
            ddl = "ALTER TABLE {} ADD COLUMN {} {}".format(table, col_name, col_def)
            log("  [+] {}".format(ddl))
            if not dry_run:
                cur.execute(ddl)


def step_map_sub_type(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """基于原始 request_type 值设置 sub_type"""
    for rt, st in SUB_TYPE_MAPPINGS:
        cur.execute(
            "SELECT COUNT(*) FROM {} WHERE request_type = ?".format(table), (rt,)
        )
        n = cur.fetchone()[0]
        log("  '{}' → sub_type='{}' : {} 条".format(rt, st, n))
        if not dry_run and n > 0:
            cur.execute(
                "UPDATE {} SET sub_type = ? WHERE request_type = ?".format(table),
                (st, rt),
            )


def step_map_request_type(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """重命名 request_type 旧值"""
    for old, new in REQUEST_TYPE_MAPPINGS:
        cur.execute(
            "SELECT COUNT(*) FROM {} WHERE request_type = ?".format(table), (old,)
        )
        n = cur.fetchone()[0]
        log("  '{}' → '{}' : {} 条".format(old, new, n))
        if not dry_run and n > 0:
            cur.execute(
                "UPDATE {} SET request_type = ? WHERE request_type = ?".format(table),
                (new, old),
            )


def step_set_work_mode(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """设置 work_mode：is_self_initiated=1 或特定 request_type → proactive"""
    # 先按 is_self_initiated（列可能已存在，也可能在重建后消失，这步在重建前执行）
    existing = get_existing_columns(cur, table)
    if "is_self_initiated" in existing:
        cur.execute(
            "SELECT COUNT(*) FROM {} WHERE is_self_initiated = 1".format(table)
        )
        n = cur.fetchone()[0]
        log("  is_self_initiated=1 → proactive : {} 条".format(n))
        if not dry_run and n > 0:
            cur.execute(
                "UPDATE {} SET work_mode = 'proactive' WHERE is_self_initiated = 1".format(table)
            )
    else:
        log("  [SKIP] is_self_initiated 列不存在（已被删除），跳过此规则")

    # 再按 request_type（映射后的值）
    placeholders = ",".join("?" * len(WORK_MODE_PROACTIVE_TYPES))
    cur.execute(
        "SELECT COUNT(*) FROM {} WHERE request_type IN ({})".format(table, placeholders),
        WORK_MODE_PROACTIVE_TYPES,
    )
    n = cur.fetchone()[0]
    log("  request_type IN {} → proactive : {} 条".format(WORK_MODE_PROACTIVE_TYPES, n))
    if not dry_run and n > 0:
        cur.execute(
            "UPDATE {} SET work_mode = 'proactive' WHERE request_type IN ({})".format(
                table, placeholders
            ),
            WORK_MODE_PROACTIVE_TYPES,
        )


def step_set_visibility(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """设置 visibility：内部项目 → internal，其余默认 public"""
    placeholders = ",".join("?" * len(VISIBILITY_INTERNAL_TYPES))
    cur.execute(
        "SELECT COUNT(*) FROM {} WHERE request_type IN ({})".format(table, placeholders),
        VISIBILITY_INTERNAL_TYPES,
    )
    n = cur.fetchone()[0]
    log("  request_type IN {} → internal : {} 条".format(VISIBILITY_INTERNAL_TYPES, n))
    if not dry_run and n > 0:
        cur.execute(
            "UPDATE {} SET visibility = 'internal' WHERE request_type IN ({})".format(
                table, placeholders
            ),
            VISIBILITY_INTERNAL_TYPES,
        )


def rebuild_table(cur: sqlite3.Cursor, table: str, dry_run: bool):
    """
    重建表：
    - 去掉 is_self_initiated 列
    - org_name / sales_id 变为 nullable（移除 NOT NULL 约束）
    - 保留重建前已存在的所有非 is_self_initiated 列

    流程：
    1. 获取现有列信息及索引
    2. CREATE {table}_new（新建 DDL）
    3. INSERT INTO {table}_new SELECT ... FROM {table}
    4. DROP TABLE {table}
    5. ALTER TABLE {table}_new RENAME TO {table}
    6. 重建索引
    """
    log("\n[REBUILD] 重建 {} 表...".format(table))

    # 获取现有列信息
    cur.execute("PRAGMA table_info({})".format(table))
    cols_info = cur.fetchall()
    # cols_info: (cid, name, type, notnull, dflt_value, pk)

    # 获取现有索引（重建后需还原）
    indexes = get_table_indexes(cur, table)
    log("  已有索引: {}".format([idx[0] for idx in indexes]))

    # 过滤掉 is_self_initiated
    keep_cols = [c for c in cols_info if c[1] != "is_self_initiated"]
    skip = [c for c in cols_info if c[1] == "is_self_initiated"]
    if skip:
        log("  [DROP] 删除列: {}".format([c[1] for c in skip]))
    else:
        log("  [INFO] is_self_initiated 列不存在，无需删除")

    # 构建新表 DDL
    col_defs = []
    for c in keep_cols:
        cid, name, ctype, notnull, dflt, pk = c
        # org_name 和 sales_id 变为 nullable（移除 NOT NULL 约束）
        if name in ("org_name", "sales_id"):
            notnull = 0
        col_def = "{} {}".format(name, ctype if ctype else "TEXT")
        if pk:
            col_def += " PRIMARY KEY"
        if notnull and not pk:
            col_def += " NOT NULL"
        if dflt is not None:
            col_def += " DEFAULT {}".format(dflt)
        col_defs.append(col_def)

    new_table = "{}_new".format(table)
    create_ddl = "CREATE TABLE {} ({})".format(new_table, ", ".join(col_defs))
    log("  CREATE DDL: {}".format(create_ddl))

    col_names = ", ".join(c[1] for c in keep_cols)
    insert_sql = "INSERT INTO {new} ({cols}) SELECT {cols} FROM {old}".format(
        new=new_table, cols=col_names, old=table
    )
    log("  INSERT SQL: {}".format(insert_sql))

    if not dry_run:
        # 删除临时表（如果上次脚本中途失败留有残留）
        cur.execute("DROP TABLE IF EXISTS {}".format(new_table))
        cur.execute(create_ddl)
        cur.execute(insert_sql)
        cur.execute("DROP TABLE {}".format(table))
        cur.execute("ALTER TABLE {} RENAME TO {}".format(new_table, table))
        log("  [OK] 表重建完成")

        # 重建索引（将旧 SQL 中的表名替换以防引用问题，其实表名不变，直接重建即可）
        for idx_name, idx_sql in indexes:
            if idx_sql:
                log("  [IDX] 重建索引: {}".format(idx_name))
                cur.execute("DROP INDEX IF EXISTS {}".format(idx_name))
                cur.execute(idx_sql)
    else:
        log("  [DRY-RUN] 跳过实际重建")


def run_migration(conn: sqlite3.Connection, dry_run: bool):
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF")

    # ── 步骤 1：幂等 DDL ──────────────────────────────────────────────────────
    log("\n[DDL] requests 表新增列...")
    step_add_columns(cur, "requests", dry_run)

    # request_templates 表可能不存在，检查一下
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='request_templates'")
    has_templates = cur.fetchone() is not None
    if has_templates:
        log("\n[DDL] request_templates 表新增列...")
        step_add_columns(cur, "request_templates", dry_run)
    else:
        log("\n[INFO] request_templates 表不存在，跳过")

    # ── 步骤 2：映射 sub_type（基于原始 request_type） ────────────────────────
    log("\n[DATA] requests - 映射 sub_type...")
    step_map_sub_type(cur, "requests", dry_run)
    if has_templates:
        log("\n[DATA] request_templates - 映射 sub_type...")
        step_map_sub_type(cur, "request_templates", dry_run)

    # ── 步骤 3：映射 request_type ─────────────────────────────────────────────
    log("\n[DATA] requests - 映射 request_type...")
    step_map_request_type(cur, "requests", dry_run)
    if has_templates:
        log("\n[DATA] request_templates - 映射 request_type...")
        step_map_request_type(cur, "request_templates", dry_run)

    # ── 步骤 4：设置 work_mode ────────────────────────────────────────────────
    log("\n[DATA] requests - 设置 work_mode...")
    step_set_work_mode(cur, "requests", dry_run)
    if has_templates:
        log("\n[DATA] request_templates - 设置 work_mode...")
        step_set_work_mode(cur, "request_templates", dry_run)

    # ── 步骤 5：设置 visibility ───────────────────────────────────────────────
    log("\n[DATA] requests - 设置 visibility...")
    step_set_visibility(cur, "requests", dry_run)
    if has_templates:
        log("\n[DATA] request_templates - 设置 visibility...")
        step_set_visibility(cur, "request_templates", dry_run)

    # ── 步骤 6：重建表（去掉 is_self_initiated，nullable 约束） ──────────────
    rebuild_table(cur, "requests", dry_run)
    if has_templates:
        rebuild_table(cur, "request_templates", dry_run)

    if dry_run:
        log("\n[DRY-RUN] 预览完成，未写入任何数据。")
        return

    cur.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    log("\n[COMMIT] 所有更改已提交。")

    # ── 步骤 7：验证 ──────────────────────────────────────────────────────────
    log("\n[VERIFY] 迁移后字段 DISTINCT 值：")

    for field in ("request_type", "sub_type", "work_mode", "visibility"):
        cur.execute(
            "SELECT DISTINCT {} FROM requests ORDER BY {}".format(field, field)
        )
        vals = [r[0] for r in cur.fetchall()]
        log("  requests.{}: {}".format(field, vals))

    # 确认 is_self_initiated 不存在
    final_cols = get_existing_columns(cur, "requests")
    if "is_self_initiated" in final_cols:
        log("\n[WARN] is_self_initiated 列仍存在，重建可能未成功！")
    else:
        log("\n[OK] is_self_initiated 列已移除")

    if "org_name" in final_cols and "sales_id" in final_cols:
        log("[OK] org_name / sales_id 列存在")

    for col in ("sub_type", "work_mode", "visibility"):
        if col in final_cols:
            log("[OK] {} 列存在".format(col))
        else:
            log("[FAIL] {} 列缺失！".format(col))

    log("\n[DONE] 迁移完成。")


def main():
    parser = argparse.ArgumentParser(
        description="分类体系重构迁移脚本（sub_type / work_mode / visibility + 表重建）"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只预览影响行数，不执行任何写操作",
    )
    parser.add_argument(
        "--db",
        default=str(DB_PATH),
        help="数据库路径（默认: {}）".format(DB_PATH),
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        log("[ERROR] 数据库不存在: {}".format(db_path))
        sys.exit(1)

    log("数据库路径  : {}".format(db_path))
    log("模式        : {}".format("DRY-RUN（预览）" if args.dry_run else "实际执行"))

    # ── 备份（事务开始前） ────────────────────────────────────────────────────
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / "data_backup_before_cr_migration.db"

    if backup_path.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        extra = backup_dir / "data_backup_before_cr_migration_{}.db".format(ts)
        shutil.copy2(backup_path, extra)
        log("旧备份另存为: {}".format(extra.name))

    log("备份到      : {}".format(backup_path))
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
        log("\n[ERROR] 迁移异常，已回滚: {}".format(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
