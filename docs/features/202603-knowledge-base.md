# 研究材料知识库模块 — 产品设计文档

> 模块代号: knowledge-base (KB)
> 隶属项目: demand-management-v2 (OpenSpec)
> 版本: v1.0

---

## 目录

1. [产品提案](#1-产品提案)
2. [数据库设计](#2-数据库设计)
3. [分类体系与预设数据](#3-分类体系与预设数据)
4. [API 设计](#4-api-设计)
5. [页面设计](#5-页面设计)
6. [业务规则](#6-业务规则)
7. [任务拆解](#7-任务拆解)
8. [后续扩展路线](#8-后续扩展路线)

---

## 1. 产品提案

### 1.1 背景

部门日常积累大量研究材料（基金经理调研、基金公司观点、券商研报、第三方机构观点等），目前分散存储在个人电脑或共享文件夹中，缺乏结构化管理。当有人需要某基金经理/某产品/某主题的材料时，只能靠口头询问，效率极低。

### 1.2 核心目标

> **一句话**: 让任何人上传研究材料时打好标签，让任何人需要材料时秒级检索并下载。

- **结构化入库**: 上传时必须填写类别、标签、来源类型等元数据
- **多维度检索**: 按类别/标签/来源/关联实体/时间组合筛选
- **规范化存储**: 文件按统一目录结构存储，元数据入库
- **可追溯**: 所有下载行为留痕，便于统计材料使用情况

### 1.3 功能边界

| 本期实现              | 明确排除 (后续扩展) |
|-------------------|-------------|
| 文件上传 + 元数据标注      | 全文搜索        |
| 多维度筛选检索           | LLM 摘要生成    |
| 文件下载 + 下载日志       | 大模型问答       |
| 管理端: 分类/标签管理      | 在线预览        |
| 管理端: 材料管理 (编辑/删除) | 版本管理 / 材料更新 |
| 管理端: 下载统计         | 对象存储迁移      |

### 1.4 角色模型

复用现有用户体系（sales / researcher / admin），所有角色权限一致:

| 操作             | sales | researcher | admin |
|----------------|-------|------------|-------|
| 上传材料           | ✅     | ✅          | ✅     |
| 检索材料           | ✅     | ✅          | ✅     |
| 下载材料           | ✅     | ✅          | ✅     |
| 编辑自己上传的材料      | ✅     | ✅          | ✅     |
| 删除自己上传的材料      | ✅     | ✅          | ✅     |
| 管理分类/标签体系      | ❌     | ❌          | ✅     |
| 管理所有材料 (编辑/删除) | ❌     | ❌          | ✅     |
| 查看下载统计         | ❌     | ❌          | ✅     |

---

## 2. 数据库设计

### 2.1 ER 关系图

```
users ──── 1:N ──── kb_materials (uploaded_by)
users ──── 1:N ──── kb_download_logs (user_id)

kb_materials ──── N:1 ──── kb_categories (category_id)
kb_materials ──── N:N ──── kb_tags (via kb_material_tags)
kb_materials ──── 1:N ──── kb_download_logs (material_id)
kb_materials ──── N:1 ──── kb_source_types (source_type_id)

kb_categories ──── 1:N ──── kb_tags (category_id, 可选归属)
```

### 2.2 新增表结构

#### kb_categories — 类别

```sql
CREATE TABLE kb_categories
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE, -- 如: 资产配置, 权益, 纯债, 固收+, 量化, FOF
    sort_order INTEGER   DEFAULT 0,  -- 排序权重
    is_deleted INTEGER   DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### kb_tags — 标签

```sql
CREATE TABLE kb_tags
(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,                         -- 如: 红利, 科技成长, 短债
    category_id INTEGER REFERENCES kb_categories (id), -- 归属类别 (NULL 表示通用标签)
    sort_order  INTEGER   DEFAULT 0,
    is_deleted  INTEGER   DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, category_id)                         -- 同一类别下标签名唯一
);
CREATE INDEX idx_kb_tags_category ON kb_tags (category_id);
```

#### kb_source_types — 来源类型

```sql
CREATE TABLE kb_source_types
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE, -- 如: 基金经理调研, 基金公司观点, 券商研报, 第三方机构观点
    sort_order INTEGER   DEFAULT 0,
    is_deleted INTEGER   DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### kb_materials — 材料主表

```sql
CREATE TABLE kb_materials
(
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL, -- 材料标题
    category_id    INTEGER NOT NULL REFERENCES kb_categories (id),
    source_type_id INTEGER NOT NULL REFERENCES kb_source_types (id),

    -- 关联实体 (来源为调研/产品类时填写; 市场观点类可不填)
    fund_company   TEXT,             -- 基金公司名称
    fund_manager   TEXT,             -- 基金经理名称
    product_name   TEXT,             -- 产品名称

    file_path      TEXT    NOT NULL, -- 相对路径: kb_uploads/{material_id}/filename
    file_name      TEXT    NOT NULL, -- 原始文件名
    file_size      INTEGER,          -- 文件大小 (bytes)
    file_type      TEXT,             -- 文件扩展名: pdf/docx/pptx/xlsx

    summary        TEXT,             -- 摘要 (本期手动填写, 后续 LLM 生成)
    remark         TEXT,             -- 备注

    uploaded_by    INTEGER NOT NULL REFERENCES users (id),
    upload_date    DATE    NOT NULL, -- 材料日期 (用户指定, 如调研日期)
    is_deleted     INTEGER   DEFAULT 0,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP
);
CREATE INDEX idx_kb_mat_category ON kb_materials (category_id);
CREATE INDEX idx_kb_mat_source ON kb_materials (source_type_id);
CREATE INDEX idx_kb_mat_company ON kb_materials (fund_company);
CREATE INDEX idx_kb_mat_manager ON kb_materials (fund_manager);
CREATE INDEX idx_kb_mat_date ON kb_materials (upload_date);
CREATE INDEX idx_kb_mat_deleted ON kb_materials (is_deleted);
```

#### kb_material_tags — 材料-标签关联 (多对多)

```sql
CREATE TABLE kb_material_tags
(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES kb_materials (id),
    tag_id      INTEGER NOT NULL REFERENCES kb_tags (id),
    UNIQUE (material_id, tag_id)
);
CREATE INDEX idx_kb_mt_material ON kb_material_tags (material_id);
CREATE INDEX idx_kb_mt_tag ON kb_material_tags (tag_id);
```

#### kb_download_logs — 下载日志

```sql
CREATE TABLE kb_download_logs
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id   INTEGER NOT NULL REFERENCES kb_materials (id),
    user_id       INTEGER NOT NULL REFERENCES users (id),
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_kb_dl_material ON kb_download_logs (material_id);
CREATE INDEX idx_kb_dl_user ON kb_download_logs (user_id);
CREATE INDEX idx_kb_dl_time ON kb_download_logs (downloaded_at);
```

---

## 3. 分类体系与预设数据

### 3.1 类别 (kb_categories)

| id | name | 说明               |
|----|------|------------------|
| 1  | 资产配置 | 宏观 / 大类资产配置观点    |
| 2  | 权益   | A股 / 港股 / 海外权益   |
| 3  | 纯债   | 利率债 / 信用债 / 纯债策略 |
| 4  | 固收+  | 固收增强 / 转债增强      |
| 5  | 量化   | 量化策略 / 指增 / 对冲   |
| 6  | FOF  | 组合策略 / FOF 产品    |
| 7  | 另类   | 商品 / REITs / 跨境  |
| 8  | 市场观点 | 综合市场研判 / 策略周报月报  |

### 3.2 标签 (kb_tags) — 按类别级联

**通用标签** (category_id = NULL, 所有类别可选):

| name |
|------|
| 周报   |
| 月报   |
| 季报   |
| 年报   |
| 路演纪要 |
| 尽调报告 |
| 产品推荐 |

**权益类标签** (category_id = 2):

| name |
|------|
| 红利   |
| 科技成长 |
| 大盘价值 |
| 小盘成长 |
| 消费   |
| 医药   |
| 新能源  |
| 资源周期 |
| 制造   |
| 金融地产 |
| 港股   |
| 美股   |
| QDII |

**纯债类标签** (category_id = 3):

| name  |
|-------|
| 短债    |
| 中长期纯债 |
| 利率债   |
| 信用债   |
| 城投债   |

**固收+类标签** (category_id = 4):

| name |
|------|
| 转债策略 |
| 股债混合 |
| 打新增强 |

**量化类标签** (category_id = 5):

| name |
|------|
| 指数增强 |
| 量化选股 |
| 市场中性 |
| CTA  |
| 多因子  |

**FOF类标签** (category_id = 6):

| name   |
|--------|
| 稳健型FOF |
| 进取型FOF |
| 目标日期   |

**资产配置类标签** (category_id = 1):

| name |
|------|
| 宏观经济 |
| 大类资产 |
| 海外宏观 |
| 政策解读 |

**另类标签** (category_id = 7):

| name  |
|-------|
| 黄金    |
| 商品    |
| REITs |

**市场观点类标签** (category_id = 8):

| name |
|------|
| A股策略 |
| 债市策略 |
| 海外市场 |

### 3.3 来源类型 (kb_source_types)

| id | name    |
|----|---------|
| 1  | 基金经理调研  |
| 2  | 基金公司观点  |
| 3  | 券商研报    |
| 4  | 第三方机构观点 |
| 5  | 内部研究    |
| 6  | 其他      |

### 3.4 级联规则

```
用户选择「类别」→ 标签下拉框加载:
  1. 该类别专属标签 (category_id = 选中类别)
  2. 通用标签 (category_id IS NULL)

用户选择「来源类型」→ 关联实体字段:
  if 来源类型 in [基金经理调研, 基金公司观点]:
      显示: 基金公司(必填), 基金经理(选填), 产品名称(选填)
  elif 来源类型 == 券商研报:
      显示: 基金公司 → 改标签为"机构名称"(必填), 其余选填
  else:
      显示: 基金公司 → 改标签为"机构名称"(选填), 其余选填
```

---

## 4. API 设计

> 所有 API 遵循现有 `/api/*` 前缀 + JWT 认证 + 统一响应格式

### 4.1 材料管理

#### 上传材料

```
POST /api/kb/materials
Content-Type: multipart/form-data

Form Fields:
  title:          string (必填)
  category_id:    int    (必填)
  source_type_id: int    (必填)
  tag_ids:        string (必填, 逗号分隔的标签ID, 如 "1,3,5")
  fund_company:   string (选填)
  fund_manager:   string (选填)
  product_name:   string (选填)
  upload_date:    string (必填, YYYY-MM-DD)
  summary:        string (选填)
  remark:         string (选填)
  file:           File   (必填, 支持 pdf/docx/pptx/xlsx, 最大 20MB)

Response:
{
  "code": 0,
  "data": { "id": 1, "title": "...", ... },
  "message": "ok"
}
```

#### 材料列表 (检索)

```
GET /api/kb/materials

Query Params:
  page:           int    (默认 1)
  page_size:      int    (默认 20, 最大 100)
  keyword:        string (标题模糊搜索)
  category_id:    int    (类别筛选)
  source_type_id: int    (来源类型筛选)
  tag_ids:        string (标签筛选, 逗号分隔, AND 关系)
  fund_company:   string (基金公司模糊搜索)
  fund_manager:   string (基金经理模糊搜索)
  product_name:   string (产品名称模糊搜索)
  date_from:      string (YYYY-MM-DD)
  date_to:        string (YYYY-MM-DD)
  uploaded_by:    int    (上传人筛选)
  sort_by:        string (默认 upload_date, 可选: created_at, title, download_count)
  sort_order:     string (默认 desc)

Response:
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1,
        "title": "xx基金2025Q1调研纪要",
        "category_id": 2,
        "category_name": "权益",
        "source_type_id": 1,
        "source_type_name": "基金经理调研",
        "tags": [
          {"id": 1, "name": "红利"},
          {"id": 7, "name": "路演纪要"}
        ],
        "fund_company": "xx基金",
        "fund_manager": "张三",
        "product_name": "xx红利优选",
        "file_name": "xx基金2025Q1调研纪要.pdf",
        "file_size": 1048576,
        "file_type": "pdf",
        "summary": "...",
        "upload_date": "2025-03-01",
        "uploaded_by": 1,
        "uploader_name": "李四",
        "download_count": 15,
        "created_at": "2025-03-01T10:00:00"
      }
    ],
    "total": 50
  },
  "message": "ok"
}
```

#### 材料详情

```
GET /api/kb/materials/:id

Response: 同列表单条, 额外包含 remark, updated_at
```

#### 编辑材料 (元数据)

```
PUT /api/kb/materials/:id
Content-Type: application/json

Body:
{
  "title": "...",
  "category_id": 2,
  "source_type_id": 1,
  "tag_ids": [1, 3, 5],
  "fund_company": "xx基金",
  "fund_manager": "张三",
  "product_name": null,
  "upload_date": "2025-03-01",
  "summary": "...",
  "remark": "..."
}

权限: 上传者本人 OR admin
```

#### 替换文件

```
POST /api/kb/materials/:id/replace-file
Content-Type: multipart/form-data

Form Fields:
  file: File (必填)

权限: 上传者本人 OR admin
说明: 删除旧文件, 存储新文件, 更新 file_path/file_name/file_size/file_type
```

#### 删除材料 (软删除)

```
DELETE /api/kb/materials/:id

权限: 上传者本人 OR admin
动作: is_deleted = 1
```

#### 下载文件

```
GET /api/kb/materials/:id/download

权限: 所有登录用户
动作: 返回文件流 + 记录下载日志
Response: FileResponse (Content-Disposition: attachment)
```

### 4.2 分类体系管理 (admin)

#### 类别 CRUD

```
GET    /api/kb/categories                    — 列表 (含 is_deleted=0 筛选)
POST   /api/kb/categories                    — 新增 { name, sort_order }
PUT    /api/kb/categories/:id                — 编辑
DELETE /api/kb/categories/:id                — 软删除
```

#### 标签 CRUD

```
GET    /api/kb/tags                          — 列表, 支持 ?category_id= 筛选
GET    /api/kb/tags/by-category/:category_id — 获取指定类别的标签 + 通用标签 (上传表单用)
POST   /api/kb/tags                          — 新增 { name, category_id, sort_order }
PUT    /api/kb/tags/:id                      — 编辑
DELETE /api/kb/tags/:id                      — 软删除
```

#### 来源类型 CRUD

```
GET    /api/kb/source-types                  — 列表
POST   /api/kb/source-types                  — 新增
PUT    /api/kb/source-types/:id              — 编辑
DELETE /api/kb/source-types/:id              — 软删除
```

### 4.3 下载日志与统计 (admin)

#### 下载日志列表

```
GET /api/kb/download-logs

Query Params:
  page, page_size
  material_id:  int    (按材料筛选)
  user_id:      int    (按用户筛选)
  date_from:    string
  date_to:      string

Response:
{
  "items": [
    {
      "id": 1,
      "material_id": 10,
      "material_title": "xx调研",
      "user_id": 3,
      "user_name": "王五",
      "downloaded_at": "2025-03-05T14:30:00"
    }
  ],
  "total": 100
}
```

#### 统计概览

```
GET /api/kb/stats/overview

Response:
{
  "total_materials": 200,
  "total_downloads": 1500,
  "this_month_uploads": 25,
  "this_month_downloads": 300,
  "top_categories": [
    {"name": "权益", "count": 80},
    {"name": "纯债", "count": 50}
  ],
  "top_downloaded": [
    {"id": 1, "title": "...", "download_count": 50}
  ]
}
```

### 4.4 辅助接口

#### 基金公司/经理/产品 自动补全

```
GET /api/kb/autocomplete

Query Params:
  field:   string (fund_company | fund_manager | product_name)
  keyword: string (模糊匹配)
  limit:   int    (默认 10)

Response:
{
  "data": ["xx基金", "yy基金", ...]
}

说明: 从 kb_materials 表中 DISTINCT 查询已有值, 供上传表单输入时自动补全
```

---

## 5. 页面设计

### 5.1 路由结构

```
/kb                          → 材料检索页 (所有角色)
/kb/upload                   → 上传材料页 (所有角色)
/kb/my-uploads               → 我的上传 (所有角色)
/admin/kb                    → 材料管理 (admin)
/admin/kb/taxonomy           → 分类体系管理: 类别/标签/来源类型 (admin)
/admin/kb/download-logs      → 下载日志 (admin)
```

### 5.2 页面详细设计

#### P1: 材料检索页 `/kb` — 核心页面

**布局**: 顶部筛选区 + 列表区

**筛选区** (横向排列, 支持折叠/展开):

| 筛选项  | 组件           | 说明                     |
|------|--------------|------------------------|
| 关键词  | Input.Search | 标题模糊搜索, 支持回车           |
| 类别   | Select       | 单选, 选项来自 kb_categories |
| 标签   | Select (多选)  | 根据已选类别级联加载             |
| 来源类型 | Select       | 单选                     |
| 基金公司 | AutoComplete | 输入补全                   |
| 基金经理 | AutoComplete | 输入补全                   |
| 产品名称 | AutoComplete | 输入补全                   |
| 材料日期 | RangePicker  | 按 upload_date 筛选       |
| 重置   | Button       | 清除所有筛选条件               |

**列表区** (ProTable):

| 列名   | 说明          |
|------|-------------|
| 标题   | 点击可展开查看摘要   |
| 类别   | Tag 展示      |
| 标签   | 多个 Tag      |
| 来源类型 |             |
| 基金公司 | 有值才显示       |
| 基金经理 | 有值才显示       |
| 材料日期 | upload_date |
| 上传人  |             |
| 下载次数 | 数字          |
| 操作   | 下载按钮        |

#### P2: 上传材料页 `/kb/upload`

**表单** (ProForm, 步骤式或单页均可, 建议单页 + 分组):

**基本信息组**:

- 标题 (必填, Input)
- 材料日期 (必填, DatePicker, 默认今天)
- 类别 (必填, Select)
- 标签 (必填, Select 多选, 根据类别级联)
- 来源类型 (必填, Select)

**关联实体组** (根据来源类型动态显示/隐藏):

- 基金公司 / 机构名称 (AutoComplete)
- 基金经理 (AutoComplete)
- 产品名称 (AutoComplete)

**文件与备注组**:

- 文件上传 (必填, Upload, 限制类型: pdf/docx/pptx/xlsx, 限制大小: 20MB)
- 摘要 (选填, TextArea, placeholder: "简要描述材料核心内容, 便于后续检索")
- 备注 (选填, TextArea)

**提交后**: 成功提示 + 跳转到「我的上传」或继续上传

#### P3: 我的上传 `/kb/my-uploads`

- ProTable, 自动过滤 uploaded_by = 当前用户
- 操作列: 编辑 (弹窗修改元数据) / 替换文件 / 删除

#### P4: 管理端-材料管理 `/admin/kb`

- ProTable, 全量数据, 支持所有筛选
- 操作列: 编辑 / 删除 / 查看下载记录

#### P5: 管理端-分类体系管理 `/admin/kb/taxonomy`

- 三个 Tab: 类别管理 / 标签管理 / 来源类型管理
- 每个 Tab 一个 ProTable + 新增/编辑弹窗
- 标签管理页额外显示所属类别列, 支持按类别筛选

#### P6: 管理端-下载日志 `/admin/kb/download-logs`

- ProTable 展示下载记录
- 筛选: 材料名称 / 下载人 / 时间范围
- 顶部统计卡片: 总下载次数 / 本月下载 / 最热门材料 / 最活跃用户

---

## 6. 业务规则

### 6.1 文件存储规则

```
存储根路径: data/kb_uploads/
目录结构:   kb_uploads/{material_id}/{原始文件名}

示例:
  kb_uploads/1/xx基金2025Q1调研纪要.pdf
  kb_uploads/2/yy券商债市周报20250301.docx
```

- 与现有 `uploads/` (需求附件) 目录隔离
- `file_path` 字段存储相对路径: `kb_uploads/{material_id}/filename`
- 替换文件时: 删除旧文件 → 存储新文件 → 更新元数据

### 6.2 文件类型与大小限制

| 限制项    | 值                                           |
|--------|---------------------------------------------|
| 允许类型   | .pdf, .docx, .doc, .pptx, .ppt, .xlsx, .xls |
| 最大文件大小 | 20MB                                        |
| 文件名规范  | 保留原始文件名, 存储时不重命名                            |

### 6.3 下载日志规则

- **触发时机**: 每次下载均记录 (不去重)
- **记录字段**: material_id, user_id, downloaded_at
- **统计用途**: 热门材料排行、用户活跃度分析、材料使用追踪
- **下载频率限制**: 暂不限制 (预留接口, 可通过配置开启每日上限)

### 6.4 软删除规则

- 材料删除: `is_deleted = 1`, 文件保留在磁盘 (避免误删)
- 类别/标签/来源类型删除: `is_deleted = 1`, 已关联的材料不受影响
- 删除的类别/标签在上传表单中不再显示, 但已有材料的历史标签仍可展示

### 6.5 标签级联规则

```python
def get_available_tags(category_id: int) -> list[Tag]:
    """返回指定类别的专属标签 + 通用标签"""
    return db.query(Tag).filter(
        Tag.is_deleted == 0,
        or_(Tag.category_id == category_id, Tag.category_id.is_(None))
    ).order_by(Tag.sort_order).all()
```

### 6.6 自动补全规则

- 从 `kb_materials` 表中 `SELECT DISTINCT fund_company / fund_manager / product_name`
- 仅查询 `is_deleted = 0` 的记录
- 模糊匹配 (`LIKE '%keyword%'`), 返回最多 10 条

### 6.7 检索排序规则

- 默认按材料日期 (`upload_date`) 降序
- 标签筛选逻辑: 选多个标签时为 **AND** 关系 (材料必须同时包含所有选中标签)
- 关键词搜索: 仅匹配标题 (`title LIKE '%keyword%'`)

---

## 7. 任务拆解

### Phase KB-0: 数据库与基础设施 (0.5天)

- [ ] 新增 6 张表的 SQLAlchemy 模型
- [ ] 编写迁移脚本 (CREATE TABLE)
- [ ] 预设数据初始化脚本 (类别/标签/来源类型)
- [ ] `data/kb_uploads/` 目录创建
- [ ] 配置项: `KB_UPLOAD_PATH`, `KB_MAX_FILE_SIZE`

### Phase KB-1: 后端 — 分类体系 CRUD (0.5天)

- [ ] `kb_categories` CRUD API
- [ ] `kb_tags` CRUD API (含 by-category 接口)
- [ ] `kb_source_types` CRUD API
- [ ] admin 权限校验
- [ ] 单元测试

### Phase KB-2: 后端 — 材料上传与管理 (1天)

- [ ] `POST /api/kb/materials` — 文件上传 + 元数据入库 + 标签关联
- [ ] `GET /api/kb/materials` — 多维度筛选查询 (含标签 JOIN)
- [ ] `GET /api/kb/materials/:id` — 详情
- [ ] `PUT /api/kb/materials/:id` — 编辑元数据 + 重建标签关联
- [ ] `POST /api/kb/materials/:id/replace-file` — 替换文件
- [ ] `DELETE /api/kb/materials/:id` — 软删除
- [ ] `GET /api/kb/autocomplete` — 实体自动补全
- [ ] 单元测试

### Phase KB-3: 后端 — 下载与统计 (0.5天)

- [ ] `GET /api/kb/materials/:id/download` — 文件下载 + 日志记录
- [ ] `GET /api/kb/download-logs` — 下载日志查询
- [ ] `GET /api/kb/stats/overview` — 统计概览
- [ ] 下载次数子查询 (材料列表中的 download_count)
- [ ] 单元测试

### Phase KB-4: 前端 — 检索与上传页面 (1.5天)

- [ ] 路由注册 (`/kb`, `/kb/upload`, `/kb/my-uploads`)
- [ ] 材料检索页: 筛选区 + ProTable + 下载
- [ ] 上传材料页: ProForm + 级联标签 + 文件上传 + AutoComplete
- [ ] 我的上传页: ProTable + 编辑弹窗 + 删除确认

### Phase KB-5: 前端 — 管理端页面 (1天)

- [ ] 路由注册 (`/admin/kb/*`)
- [ ] 材料管理页
- [ ] 分类体系管理页 (三 Tab)
- [ ] 下载日志页 + 统计卡片

### Phase KB-6: 集成测试与部署 (0.5天)

- [ ] 端到端测试: 上传 → 检索 → 下载 → 日志验证
- [ ] Nginx 路由配置 (新增 `/kb` 前端路由)
- [ ] 生产环境迁移脚本执行
- [ ] 预设数据导入确认

**总工期估算: ~5.5 天**

---

## 8. 后续扩展路线

### Phase KB-EXT-1: LLM 摘要生成

```
上传材料 → 提取文本 (pdf/docx 解析)
         → 调用 LLM API 生成结构化摘要
         → 写入 kb_materials.summary
```

- 新增字段: `summary_status` (pending / completed / failed)
- 异步任务: 上传后排队处理

### Phase KB-EXT-2: 语义检索 + 问答

```
摘要文本 → Embedding 向量化 → 存入向量数据库
用户提问 → Query Embedding → 相似度检索 → Top-K 材料
        → 材料摘要 + 用户问题 → LLM 生成回答
```

- 向量存储: ChromaDB / Milvus Lite (轻量嵌入)
- 新增接口: `POST /api/kb/ask` — 自然语言问答

### Phase KB-EXT-3: 在线预览

- PDF: 浏览器原生 / pdf.js
- Office: LibreOffice 转 PDF 后预览

### Phase KB-EXT-4: 存储迁移

- 当文件量超过 ~5GB 时考虑
- 迁移到 MinIO (S3 兼容) 或云存储
- `file_path` 字段改为存储对象 key, 下载接口改为生成 presigned URL

---

## 附录: 目录结构新增

```
server/
├── app/
│   ├── api/
│   │   ├── kb_materials.py      # 材料上传/检索/下载
│   │   ├── kb_categories.py     # 类别 CRUD
│   │   ├── kb_tags.py           # 标签 CRUD
│   │   └── kb_source_types.py   # 来源类型 CRUD
│   ├── models/
│   │   └── kb.py                # 所有 KB 模型
│   ├── schemas/
│   │   └── kb.py                # Pydantic schemas
│   └── services/
│       └── kb_service.py        # 业务逻辑
├── data/
│   ├── uploads/                 # 现有需求附件 (不变)
│   └── kb_uploads/              # 新增: 知识库文件存储
└── scripts/
    └── init_kb_data.py          # 预设数据初始化

web/src/pages/
├── KB/
│   ├── Search/index.tsx         # 材料检索页
│   ├── Upload/index.tsx         # 上传材料页
│   └── MyUploads/index.tsx      # 我的上传
├── Admin/
│   ├── KBMaterials/index.tsx    # 材料管理
│   ├── KBTaxonomy/index.tsx     # 分类体系管理
│   └── KBDownloadLogs/index.tsx # 下载日志
```
