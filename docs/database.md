# database.md — 数据库设计

> ⚠️ 现有 data.db 直接复用, 以下为 SQLAlchemy 模型映射 + 新增字段

---

## 1. ER 关系图

```
users ─┬─ 1:N ─── requests (sales_id)
       ├─ 1:N ─── requests (researcher_id)
       ├─ 1:N ─── requests (created_by)
       ├─ N:1 ─── teams (team_id)
       └─ 1:N ─── download_logs (user_id)

teams ──── N:N ─── organizations (via team_org_mapping)

requests ── 1:N ─── download_logs (request_id)
```

---

## 2. 表结构 (现有, 保持不变)

### 2.1 users

```sql
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password      TEXT    NOT NULL,              -- 现有 SHA256, 新用户用 bcrypt
    role          TEXT    NOT NULL,              -- sales | researcher | admin
    display_name  TEXT    NOT NULL,
    team_id       INTEGER REFERENCES teams(id),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 requests

```sql
CREATE TABLE requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    description     TEXT,
    request_type    TEXT    NOT NULL,
    research_scope  TEXT,
    org_name        TEXT    NOT NULL,
    org_type        TEXT,
    department      TEXT,
    sales_id        INTEGER NOT NULL REFERENCES users(id),
    researcher_id   INTEGER REFERENCES users(id),
    is_confidential INTEGER DEFAULT 0,
    status          TEXT    DEFAULT 'pending',   -- pending | in_progress | completed
    result_note     TEXT,
    attachment_path TEXT,
    work_hours      REAL    DEFAULT 0,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    completed_at    TIMESTAMP
);
```

### 2.3 teams

```sql
CREATE TABLE teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.4 organizations

```sql
CREATE TABLE organizations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    org_type   TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.5 team_org_mapping

```sql
CREATE TABLE team_org_mapping (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id    INTEGER NOT NULL REFERENCES teams(id),
    org_id     INTEGER NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, org_id)
);
```

### 2.6 download_logs

```sql
CREATE TABLE download_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    org_name      TEXT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dl_request ON download_logs(request_id);
CREATE INDEX idx_dl_user    ON download_logs(user_id);
```

---

## 3. 新增字段 (ALTER TABLE 迁移)

### 3.1 users 表追加

```sql
-- 密码版本标记, 用于 SHA256→bcrypt 平滑迁移
ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1;
-- 1 = SHA256 (legacy), 2 = bcrypt (new)
```

**迁移策略**: 用户登录时, 若 `password_version=1`, 验证 SHA256 通过后自动升级为 bcrypt 并写回, 更新 `password_version=2`。

---

## 4. 建议索引 (性能)

```sql
-- requests 常用查询加速
CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_req_sales ON requests(sales_id);
CREATE INDEX IF NOT EXISTS idx_req_researcher ON requests(researcher_id);
CREATE INDEX IF NOT EXISTS idx_req_created_at ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_req_confidential ON requests(is_confidential);

-- download_logs 时间范围查询
CREATE INDEX IF NOT EXISTS idx_dl_time ON download_logs(downloaded_at);
```

---

## 5. 配置常量 (代码层, 非数据库)

```python
# 需求类型
REQUEST_TYPES = ["基金筛选", "传统报告定制", "量化策略定制", "系统定制", "综合暂时兜底"]

# 研究范畴
RESEARCH_SCOPES = ["纯债", "固收+", "权益", "量化", "资产配置", "其他"]

# 客户类型
ORG_TYPES = ["银行", "券商", "保险", "理财", "FOF", "信托", "私募", "期货", "其他"]

# 部门映射 (仅特定客户类型有子部门)
DEPARTMENT_MAP = {
    "银行": ["金市", "资管", "其他"],
    "券商": ["自营", "资管", "其他"],
    "保险": ["母公司", "资管", "其他"],
}

# 需求状态
STATUSES = ["pending", "in_progress", "completed"]
```
