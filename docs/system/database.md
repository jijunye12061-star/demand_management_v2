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
requests ── 1:N ─── requests (parent_request_id, 自引用: 原始→衍生)
```

---

## 2. 表结构 (现有, 保持不变)

### 2.1 users

```sql
CREATE TABLE users
(
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT    NOT NULL UNIQUE,
    password         TEXT    NOT NULL,          -- SHA256 (legacy) 或 bcrypt
    role             TEXT    NOT NULL,          -- sales | researcher | admin
    display_name     TEXT    NOT NULL,
    team_id          INTEGER REFERENCES teams (id),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_version INTEGER   DEFAULT 1,       -- 1=SHA256, 2=bcrypt
    is_deleted       INTEGER   DEFAULT 0
);
```

### 2.2 requests

```sql
CREATE TABLE requests
(
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    title              TEXT    NOT NULL,
    description        TEXT,
    request_type       TEXT    NOT NULL,
    research_scope     TEXT,
    org_name           TEXT    NOT NULL,
    org_type           TEXT,
    department         TEXT,
    sales_id           INTEGER NOT NULL REFERENCES users (id),
    researcher_id      INTEGER REFERENCES users (id),
    is_confidential    INTEGER   DEFAULT 0,
    status             TEXT      DEFAULT 'pending', -- pending | in_progress | completed | withdrawn | canceled | deleted
    result_note        TEXT,
    attachment_path    TEXT,                    -- 格式: uploads/{request_id}/filename
    work_hours         REAL      DEFAULT 0,
    created_by         INTEGER REFERENCES users (id),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP,
    completed_at       TIMESTAMP,
    withdraw_reason    TEXT,                    -- 研究员退回时必填，重新提交后清空
    is_self_initiated  INTEGER   DEFAULT 0,     -- 1=外出调研/研究员自主发起
    automation_hours   REAL      DEFAULT NULL,  -- 自动化工时（CA功能）
    parent_request_id  INTEGER   DEFAULT NULL REFERENCES requests (id),  -- 关联原始需求（衍生/修改来源）
    link_type          TEXT      DEFAULT NULL   -- 关联类型: 'revision'=修改迭代, 'sub'=衍生需求
);
```

### 2.3 teams

```sql
CREATE TABLE teams
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER DEFAULT 0
);
```

### 2.4 organizations

```sql
CREATE TABLE organizations
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    org_type   TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER DEFAULT 0
);
```

### 2.5 team_org_mapping

```sql
CREATE TABLE team_org_mapping
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id    INTEGER NOT NULL REFERENCES teams (id),
    org_id     INTEGER NOT NULL REFERENCES organizations (id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, org_id)
);
```

### 2.6 request_collaborators

```sql
CREATE TABLE request_collaborators
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES requests (id),
    user_id    INTEGER NOT NULL REFERENCES users (id),
    work_hours REAL      DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_collab_request ON request_collaborators (request_id);
CREATE INDEX idx_collab_user ON request_collaborators (user_id);
```

**用途**: 多研究员协作，记录每位协作者的工时。

### 2.7 request_templates

```sql
CREATE TABLE request_templates
(
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- (其余列由初始建表定义)
    usage_count  INTEGER   DEFAULT 0,
    updated_at   TIMESTAMP,
    is_deleted   INTEGER   DEFAULT 0
);
```

**注**: 软删除，`is_deleted=1` 时前端不展示。

### 2.8 download_logs

```sql
CREATE TABLE download_logs
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests (id),
    user_id       INTEGER NOT NULL REFERENCES users (id),
    org_name      TEXT, -- 销售选择的机构 (非需求关联机构), 研究员/admin 为 null
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dl_request ON download_logs (request_id);
CREATE INDEX idx_dl_user ON download_logs (user_id);
```

---

## 3. 字段说明

所有字段已反映在 §2 建表 DDL 中。以下补充关键字段的业务语义：

- `users.password_version`: 1=SHA256(旧), 2=bcrypt(新)。登录时若为1，验证通过后自动升级为2。
- `requests.withdraw_reason`: 研究员退回时必填，重新提交后清空。
- `requests.is_self_initiated`: 1 表示外出调研或研究员自主发起的需求，不依赖销售提交。
- `requests.automation_hours`: 自动化辅助完成的工时，与 `work_hours`（人工工时）分开记录。
- `requests.parent_request_id`: 指向关联的原始需求 ID，与 `link_type` 配合使用。
- `requests.link_type`: 关联类型，`'revision'` = 修改迭代需求（从详情页"发起修改"创建），`'sub'` = 衍生需求（手动关联）。未关联时为 NULL。
- `*.is_deleted`: 软删除标记，所有查询应加 `WHERE is_deleted = 0`。

---

## 4. 建议索引 (性能)

```sql
-- requests 常用查询加速
CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_req_sales ON requests(sales_id);
CREATE INDEX IF NOT EXISTS idx_req_researcher ON requests(researcher_id);
CREATE INDEX IF NOT EXISTS idx_req_created_at ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_req_confidential ON requests(is_confidential);
-- 修改迭代 / 衍生需求关联查询
CREATE INDEX IF NOT EXISTS idx_req_parent ON requests(parent_request_id);

-- download_logs 时间范围查询
CREATE INDEX IF NOT EXISTS idx_dl_time ON download_logs(downloaded_at);
```

---

## 5. 配置常量 (代码层, 非数据库)

```python
# 需求类型 (当前值)
# 历史改名: 传统报告定制→报告定制, 量化策略定制→量化策略开发, 系统定制→工具/系统开发,
#           综合暂时兜底→其他, 外出调研→调研
REQUEST_TYPES = ["基金筛选", "报告定制", "定期报告", "调研", "量化策略开发", "工具/系统开发", "其他"]

# 研究范畴 (当前值)
# 历史改名: 其他→综合/行业; 新增: 不涉及 (工具/系统开发类使用)
RESEARCH_SCOPES = ["纯债", "固收+", "权益", "量化", "资产配置", "综合/行业", "不涉及"]

# 客户类型
ORG_TYPES = ["银行", "券商", "保险", "理财", "FOF", "信托", "私募", "期货", "其他"]

# 部门映射 (仅特定客户类型有子部门)
DEPARTMENT_MAP = {
    "银行": ["金市", "资管", "其他"],
    "券商": ["自营", "资管", "其他"],
    "保险": ["母公司", "资管", "其他"],
}

# 需求状态
STATUSES = ["pending", "in_progress", "completed", "withdrawn", "canceled"]

# 附件存储根目录
UPLOAD_DIR = "data/uploads"  # 实际路径: uploads/{request_id}/filename
```
