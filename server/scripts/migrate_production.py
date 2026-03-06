"""
migrate_production.py — 将现有 data.db 迁移到新系统格式
=========================================================
操作:
  1. 备份原 DB
  2. ALTER TABLE: 添加 password_version, withdraw_reason
  3. 转换 attachment_path: 绝对路径 → 相对路径
  4. 迁移附件文件: 扁平目录 → 按 request_id 分目录
  5. 创建性能索引

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

# data 根目录 = db 所在目录 (通常是 data/)
data_dir = db_path.parent
new_upload_dir = data_dir / "uploads"  # 新的附件根目录: data/uploads/

print(f"{'🔍 DRY RUN' if dry_run else '🚀 EXECUTING'}")
print(f"数据库: {db_path.resolve()}")
print(f"附件目标: {new_upload_dir.resolve()}")
print(f"{'='*60}\n")

# ── Step 0: 备份 ──
if not dry_run:
    backup = db_path.with_suffix(f".backup_{datetime.now():%Y%m%d_%H%M%S}.db")
    shutil.copy2(db_path, backup)
    print(f"✅ 备份已创建: {backup}\n")

conn = sqlite3.connect(str(db_path))
conn.row_factory = sqlite3.Row

# ── Step 1: ALTER TABLE ──
print("Step 1: 添加新字段")

existing_user_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
existing_req_cols = {r[1] for r in conn.execute("PRAGMA table_info(requests)")}

alters = []
if "password_version" not in existing_user_cols:
    alters.append(("users", "ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1"))
if "withdraw_reason" not in existing_req_cols:
    alters.append(("requests", "ALTER TABLE requests ADD COLUMN withdraw_reason TEXT"))

for table, sql in alters:
    print(f"  + {table}: {sql.split('ADD COLUMN ')[1]}")
    if not dry_run:
        conn.execute(sql)

if not alters:
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

    # 解析旧路径: 可能是绝对路径 D:\...\uploads\481_文件名.xlsx
    old_path = Path(old_path_str)
    old_filename = old_path.name  # e.g. "481_2026年1月基金申赎报告.xlsx"

    # 从文件名中去掉 "{request_id}_" 前缀，得到纯文件名
    # 模式: {数字}_{真实文件名}
    match = re.match(r"^\d+_(.+)$", old_filename)
    clean_filename = match.group(1) if match else old_filename

    # 新的相对路径
    new_rel = f"uploads/{req_id}/{clean_filename}"
    new_abs = data_dir / new_rel

    print(f"  [{req_id}] {old_filename}")
    print(f"       → {new_rel}")

    # 尝试找到旧文件 (可能在多个位置)
    candidates = [
        old_path,                                              # 原始绝对路径
        Path("uploads") / old_filename,                        # 相对于 cwd
        data_dir.parent / "uploads" / old_filename,            # 项目根/uploads/
    ]

    source = None
    for c in candidates:
        if c.exists():
            source = c
            break

    if source:
        if not dry_run:
            new_abs.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, new_abs)
            conn.execute("UPDATE requests SET attachment_path = ? WHERE id = ?", (new_rel, req_id))
        print(f"       ✅ 文件已复制 ({source})")
        migrated += 1
    else:
        # 文件不存在，仍然更新路径（让系统知道预期位置）
        if not dry_run:
            conn.execute("UPDATE requests SET attachment_path = ? WHERE id = ?", (new_rel, req_id))
        print(f"       ⚠️  源文件未找到，仅更新路径")
        errors += 1

conn.commit()
print(f"\n  统计: 迁移 {migrated}, 跳过(已是新格式) {skipped}, 文件缺失 {errors}\n")

# ── Step 3: 创建索引 ──
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

# 4a: password_version 全部有值
current_user_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
if "password_version" in current_user_cols:
    pv_null = conn.execute("SELECT COUNT(*) FROM users WHERE password_version IS NULL").fetchone()[0]
    if pv_null:
        print(f"  修复 {pv_null} 个用户的 password_version 为 1 (SHA256)")
        if not dry_run:
            conn.execute("UPDATE users SET password_version = 1 WHERE password_version IS NULL")
            conn.commit()
    else:
        print(f"  ✅ password_version 全部已设置")
else:
    user_count_for_fix = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    print(f"  (dry-run) 将为 {user_count_for_fix} 个用户设置 password_version = 1")

# 4b: 检查是否有非法的 request_type 值（数据清洗提示）
types = conn.execute(
    "SELECT request_type, COUNT(*) FROM requests GROUP BY request_type ORDER BY COUNT(*) DESC"
).fetchall()
print(f"  需求类型分布:")
for t, c in types:
    flag = "  ⚠️" if "(" in str(t) or len(str(t)) > 20 else ""  # 标记可能的脏数据
    print(f"    {t}: {c}{flag}")

# 4c: attachment_path 格式检查
bad_paths = conn.execute(
    "SELECT COUNT(*) FROM requests WHERE attachment_path IS NOT NULL AND attachment_path NOT LIKE 'uploads/%'"
).fetchone()[0]
if bad_paths:
    print(f"  ⚠️  仍有 {bad_paths} 条附件路径非标准格式")
else:
    print(f"  ✅ 所有附件路径已标准化")

# 4d: 汇总
user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
req_count = conn.execute("SELECT COUNT(*) FROM requests").fetchone()[0]
org_count = conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0]
team_count = conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
att_count = conn.execute("SELECT COUNT(*) FROM requests WHERE attachment_path IS NOT NULL").fetchone()[0]
print(f"\n  数据量: {user_count} 用户, {req_count} 需求, {org_count} 机构, {team_count} 团队, {att_count} 附件")

conn.close()

print(f"\n{'='*60}")
if dry_run:
    print("🔍 预览完成，未做任何修改。去掉 --dry-run 执行实际迁移。")
else:
    print("✅ 迁移完成！可以启动新系统了。")
    print(f"   备份文件: {backup}")