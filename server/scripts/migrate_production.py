"""
migrate_production.py — 将现有 data.db 迁移到新系统格式
=========================================================
操作:
  1. 备份原 DB
  2. ALTER TABLE: password_version, withdraw_reason, is_deleted (软删除)
  3. 转换 attachment_path: 绝对/扁平路径 → uploads/{request_id}/filename
  4. 迁移附件文件: 扁平目录 → 按 request_id 分目录
  5. 创建性能索引
  6. 数据完整性校验

用法:
  python migrate_production.py                           # 默认 data/data.db
  python migrate_production.py path/to/data.db           # 指定路径
  python migrate_production.py data/data.db --dry-run    # 只预览不执行
"""
import sqlite3, shutil, sys, re
from pathlib import Path
from datetime import datetime

db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/data.db")
dry_run = "--dry-run" in sys.argv

if not db_path.exists():
    print(f"❌ 数据库不存在: {db_path}")
    sys.exit(1)

data_dir = db_path.parent
new_upload_dir = data_dir / "uploads"

print(f"{'🔍 DRY RUN' if dry_run else '🚀 EXECUTING'}")
print(f"数据库: {db_path.resolve()}")
print(f"附件目标: {new_upload_dir.resolve()}")
print(f"{'='*60}\n")


# ── 工具函数 ──
def get_columns(table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def get_indexes() -> set[str]:
    return {r[1] for r in conn.execute("SELECT * FROM sqlite_master WHERE type='index'")}


def add_column_if_missing(table: str, col: str, col_def: str) -> bool:
    """幂等地添加列，返回是否执行了添加"""
    if col in get_columns(table):
        return False
    sql = f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"
    print(f"  + {table}.{col}: {col_def}")
    if not dry_run:
        conn.execute(sql)
    return True


# ── Step 0: 备份 ──
if not dry_run:
    backup = db_path.with_suffix(f".backup_{datetime.now():%Y%m%d_%H%M%S}.db")
    shutil.copy2(db_path, backup)
    print(f"✅ 备份已创建: {backup}\n")

conn = sqlite3.connect(str(db_path))
conn.row_factory = sqlite3.Row

# ── Step 1: ALTER TABLE — 所有新字段 ──
print("Step 1: 添加新字段")

changes = [
    # (table, column_name, column_definition)
    ("users",         "password_version", "INTEGER DEFAULT 1"),
    ("users",         "is_deleted",       "INTEGER DEFAULT 0"),
    ("organizations", "is_deleted",       "INTEGER DEFAULT 0"),
    ("teams",         "is_deleted",       "INTEGER DEFAULT 0"),
    ("requests",      "withdraw_reason",  "TEXT"),
]

added = sum(add_column_if_missing(t, c, d) for t, c, d in changes)
if not added:
    print("  (无需添加，字段已存在)")

conn.commit()
print()

# ── Step 2: 迁移附件路径 + 文件 ──
print("Step 2: 迁移附件")

rows = conn.execute(
    "SELECT id, attachment_path FROM requests WHERE attachment_path IS NOT NULL AND attachment_path != ''"
).fetchall()

migrated, skipped, errors = 0, 0, 0

for row in rows:
    req_id = row["id"]
    old_path_str = row["attachment_path"]

    # 已经是新格式 uploads/{id}/xxx → 跳过
    if old_path_str.startswith("uploads/"):
        skipped += 1
        continue

    old_path = Path(old_path_str)
    old_filename = old_path.name

    # 去掉 "{request_id}_" 前缀
    match = re.match(r"^\d+_(.+)$", old_filename)
    clean_filename = match.group(1) if match else old_filename

    new_rel = f"uploads/{req_id}/{clean_filename}"
    new_abs = data_dir / new_rel

    print(f"  [{req_id}] {old_filename} → {new_rel}")

    # 在多个候选位置查找旧文件
    candidates = [
        old_path,                                   # 原始绝对路径
        Path("uploads") / old_filename,             # 相对于 cwd
        data_dir.parent / "uploads" / old_filename, # 项目根/uploads/
    ]
    source = next((c for c in candidates if c.exists()), None)

    if source:
        if not dry_run:
            new_abs.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, new_abs)
            conn.execute("UPDATE requests SET attachment_path = ? WHERE id = ?", (new_rel, req_id))
        print(f"       ✅ 已复制 ({source})")
        migrated += 1
    else:
        if not dry_run:
            conn.execute("UPDATE requests SET attachment_path = ? WHERE id = ?", (new_rel, req_id))
        print(f"       ⚠️  源文件未找到，仅更新路径")
        errors += 1

conn.commit()
print(f"\n  统计: 迁移 {migrated}, 跳过(已新格式) {skipped}, 文件缺失 {errors}\n")

# ── Step 3: 创建性能索引 ──
print("Step 3: 创建性能索引")

indexes = [
    "CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status)",
    "CREATE INDEX IF NOT EXISTS idx_req_sales ON requests(sales_id)",
    "CREATE INDEX IF NOT EXISTS idx_req_researcher ON requests(researcher_id)",
    "CREATE INDEX IF NOT EXISTS idx_req_created_at ON requests(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_req_confidential ON requests(is_confidential)",
    "CREATE INDEX IF NOT EXISTS idx_dl_request ON download_logs(request_id)",
    "CREATE INDEX IF NOT EXISTS idx_dl_user ON download_logs(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_dl_time ON download_logs(downloaded_at)",
]

for sql in indexes:
    idx_name = sql.split("EXISTS ")[1].split(" ON")[0]
    print(f"  + {idx_name}")
    if not dry_run:
        conn.execute(sql)

conn.commit()
print()

# ── Step 4: 数据完整性校验 ──
print("Step 4: 数据校验")

# 4a: password_version — 确保无 NULL
pv_null = conn.execute("SELECT COUNT(*) FROM users WHERE password_version IS NULL").fetchone()[0]
if pv_null:
    print(f"  修复 {pv_null} 个用户的 password_version 为 1 (SHA256)")
    if not dry_run:
        conn.execute("UPDATE users SET password_version = 1 WHERE password_version IS NULL")
        conn.commit()
else:
    print(f"  ✅ password_version 全部已设置")

# 4b: is_deleted — 确保无 NULL (旧数据默认未删除)
for table in ("users", "organizations", "teams"):
    null_count = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE is_deleted IS NULL").fetchone()[0]
    if null_count:
        print(f"  修复 {table}: {null_count} 条 is_deleted 设为 0")
        if not dry_run:
            conn.execute(f"UPDATE {table} SET is_deleted = 0 WHERE is_deleted IS NULL")
            conn.commit()
    else:
        print(f"  ✅ {table}.is_deleted 全部已设置")

# 4c: 需求类型分布（脏数据提示）
types = conn.execute(
    "SELECT request_type, COUNT(*) FROM requests GROUP BY request_type ORDER BY COUNT(*) DESC"
).fetchall()
print(f"  需求类型分布:")
for t, c in types:
    flag = "  ⚠️" if "(" in str(t) or len(str(t)) > 20 else ""
    print(f"    {t}: {c}{flag}")

# 4d: attachment_path 格式检查
bad_paths = conn.execute(
    "SELECT COUNT(*) FROM requests WHERE attachment_path IS NOT NULL AND attachment_path NOT LIKE 'uploads/%'"
).fetchone()[0]
print(f"  {'⚠️  仍有 ' + str(bad_paths) + ' 条附件路径非标准格式' if bad_paths else '✅ 所有附件路径已标准化'}")

# 4e: 汇总
counts = {
    label: conn.execute(sql).fetchone()[0]
    for label, sql in [
        ("用户", "SELECT COUNT(*) FROM users"),
        ("需求", "SELECT COUNT(*) FROM requests"),
        ("机构", "SELECT COUNT(*) FROM organizations"),
        ("团队", "SELECT COUNT(*) FROM teams"),
        ("附件", "SELECT COUNT(*) FROM requests WHERE attachment_path IS NOT NULL"),
    ]
}
print(f"\n  数据量: {', '.join(f'{v} {k}' for k, v in counts.items())}")

conn.close()

print(f"\n{'='*60}")
if dry_run:
    print("🔍 预览完成，未做任何修改。去掉 --dry-run 执行实际迁移。")
else:
    print("✅ 迁移完成！可以启动新系统了。")
    print(f"   备份文件: {backup}")