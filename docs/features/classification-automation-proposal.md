# 需求分类体系重构 + 自动化工作量管理 — 技术实施方案

> 模块代号: classification-automation (CA)
> 隶属项目: demand-management-v2 (OpenSpec)
> 版本: v1.0
> 状态: 待实施
> 项目根路径: `D:\jjy\demand_management_v2\`

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [特性 1：需求分类体系重构](#2-特性-1需求分类体系重构)
3. [特性 2：自动化工作量管理](#3-特性-2自动化工作量管理)
4. [数据库变更与存量迁移](#4-数据库变更与存量迁移)
5. [后端变更](#5-后端变更)
6. [前端变更](#6-前端变更)
7. [统计与分析影响](#7-统计与分析影响)
8. [分阶段实施计划](#8-分阶段实施计划)

---

## 1. 背景与目标

### 1.1 当前问题

**分类体系不完整：** 现有 `request_type` 仅覆盖 5 项（基金筛选、传统报告定制、量化策略定制、系统定制、综合暂时兜底），无法区分客户课题研究、自发定期报告、独家调研、基建工作等不同工作形式。`research_scope` 缺少行业统计类的归类，基建类工作被迫选"其他"。

**自动化价值不可见：** 研究员首次完成某类需求时，常伴随大量自动化流程建设（如搭建脚本、数据管道），该投入混在 `work_hours` 中无法拆分。后续同类需求只需跑脚本微调，节省的工时无法量化，自动化建设的投入回报无从体现。

### 1.2 目标

1. **重构分类体系**：让 `request_type` 覆盖所有工作形式，`research_scope` 覆盖所有资产/研究领域
2. **自动化工时分离**：交付工时与自动化建设工时拆分记录
3. **需求关联链**：通过"原始→衍生"关联，为未来自动化投入回报分析预留数据结构
4. **零侵入**：新增字段均可选，普通需求完全不受影响

---

## 2. 特性 1：需求分类体系重构

### 2.1 需求类型 (`request_type`) — 工作形式维度

回答问题：**这个需求要怎么做？**

| 值 | 说明 | 示例 |
|---|---|---|
| 基金筛选 | 客户驱动的单次筛选 | 符合 xx 条件的基金有哪些 |
| 报告定制 | 一次性定制报告、客户课题研究 | 研究 xx 因素对基金的影响 |
| 定期报告 | 自发的周期性报告产出 | 申赎数据报告、基金季报解读、观点解析 |
| 调研 | 独家调研（外出/线上） | 基金经理访谈、基金公司实地调研 |
| 量化策略开发 | 量化策略相关的定制工作 | 策略回测、因子开发 |
| 工具/系统开发 | 基建与探索性工作 | 数据库维护、网站搭建、自动化脚本 |
| 其他 | 兜底 | 上述均不适用的杂项工作 |

**存量映射：**

| 旧值 | → 新值 |
|---|---|
| 基金筛选 | 基金筛选（不变） |
| 传统报告定制 | 报告定制 |
| 量化策略定制 | 量化策略开发 |
| 系统定制 | 工具/系统开发 |
| 综合暂时兜底 | 其他 |

### 2.2 研究范围 (`research_scope`) — 资产/研究领域维度

回答问题：**这个需求研究的是什么领域？**

字段属性：**非必填**（保持现状）。

| 值 | 涵盖范围 |
|---|---|
| 纯债 | 利率债、信用债、纯债策略 |
| 固收+ | 固收增强、转债增强 |
| 权益 | A 股、港股、海外权益 |
| 量化 | 量化策略、指增、对冲、CTA |
| 资产配置 | 多资产组合、宏观研究、综合观点 |
| 综合/行业 | 货币基金、基金公司统计、行业数据、规模分析等非特定资产类别 |
| 不涉及 | 基建、工具开发等不涉及资产类别的工作 |

**存量映射：**

| 旧值 | → 新值 |
|---|---|
| 纯债/固收+/权益/量化/资产配置 | 不变 |
| 其他 | 综合/行业 |
| (空) | (空，保持) |

**前端联动：** 当 `request_type = 工具/系统开发` 时，`research_scope` 自动默认"不涉及"（用户可手动修改）。

### 2.3 需求动态 (feed) 过滤规则调整

现有规则：`status = 'completed'` AND `is_confidential = 0`

**新增硬编码过滤：** `request_type NOT IN ('工具/系统开发')`

> 理由：基建类属内部建设，不面向客户。如需隐藏其他个别需求，使用保密开关即可。

---

## 3. 特性 2：自动化工作量管理

### 3.1 核心概念

```
┌─────────────────────────────────────┐
│  原始需求 (首次建设)                    │
│  work_hours: 8h    (交付工时)          │
│  automation_hours: 16h (自动化建设工时)  │
│  parent_request_id: NULL              │
└──────────────┬────────────────────────┘
               │ 衍生关联
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ 衍生 #1 │ │ 衍生 #2 │ │ 衍生 #3 │
│ 1h     │ │ 1h     │ │ 0.5h   │
│ 0h     │ │ 0h     │ │ 0h     │
└────────┘ └────────┘ └────────┘

自动化投入: 16h → 后续节省显著 → 数据可追溯
```

### 3.2 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `automation_hours` | REAL, DEFAULT NULL | 自动化建设工时，与 `work_hours`（交付工时）独立 |
| `parent_request_id` | INTEGER, DEFAULT NULL, FK → requests.id | 关联原始需求，形成"原始→衍生"链 |

**典型场景：**

| 场景 | work_hours | automation_hours | parent_request_id |
|---|---|---|---|
| 普通需求（大多数） | 8h | 空 | 空 |
| 首次建设自动化流程 | 8h | 16h | 空 |
| 后续跑脚本出结果 | 1h | 空 | → 原始需求 ID |
| 对已有自动化流程迭代 | 2h | 4h | → 原始需求 ID |

### 3.3 关联规则

- 单亲：一个需求最多一个 `parent_request_id`
- 一对多：一个需求可被多个衍生需求关联
- 循环引用校验：沿 parent 链向上追溯（最多 10 层），不得回到自身
- 关联搜索范围：`status IN ('completed', 'in_progress')` 的需求
- 软删除保留：原始需求被删除/取消时，衍生需求的 `parent_request_id` 不清空

### 3.4 自动化标识推导

不新增 `is_automated` 字段。前端通过以下逻辑推导并展示蓝色"自动化"标签：

```
显示自动化标签 = automation_hours > 0 OR parent_request_id IS NOT NULL
```

---

## 4. 数据库变更与存量迁移

### 4.1 DDL 变更

```sql
ALTER TABLE requests ADD COLUMN automation_hours REAL DEFAULT NULL;
ALTER TABLE requests ADD COLUMN parent_request_id INTEGER DEFAULT NULL REFERENCES requests(id);
```

### 4.2 存量数据迁移 SQL

```sql
-- request_type 映射
UPDATE requests SET request_type = '报告定制'      WHERE request_type = '传统报告定制';
UPDATE requests SET request_type = '量化策略开发'   WHERE request_type = '量化策略定制';
UPDATE requests SET request_type = '工具/系统开发'  WHERE request_type = '系统定制';
UPDATE requests SET request_type = '其他'          WHERE request_type = '综合暂时兜底';

-- research_scope 映射
UPDATE requests SET research_scope = '综合/行业'   WHERE research_scope = '其他';
```

### 4.3 迁移脚本要求

- 脚本路径：`server/scripts/migrate_classification_automation.py`
- **幂等**：用 `PRAGMA table_info(requests)` 检查字段是否已存在后再 `ALTER TABLE`
- **Dry-run 模式**：`--dry-run` 参数只输出 `SELECT COUNT(*)` 影响行数，不执行写操作
- **备份**：迁移前调用 `sqlite3.backup()` 创建 `data_backup_before_ca_migration.db`
- **验证**：迁移后打印 `SELECT DISTINCT request_type FROM requests` 和 `SELECT DISTINCT research_scope FROM requests` 确认无旧值残留

---

## 5. 后端变更

### 5.1 常量更新

文件：`server/app/utils/constants.py`

```python
# 旧
REQUEST_TYPES = ["基金筛选", "传统报告定制", "量化策略定制", "系统定制", "综合暂时兜底"]
RESEARCH_SCOPES = ["纯债", "固收+", "权益", "量化", "资产配置", "其他"]

# 新
REQUEST_TYPES = ["基金筛选", "报告定制", "定期报告", "调研", "量化策略开发", "工具/系统开发", "其他"]
RESEARCH_SCOPES = ["纯债", "固收+", "权益", "量化", "资产配置", "综合/行业", "不涉及"]
```

### 5.2 Model 更新

文件：`server/app/models.py`

`Request` 模型新增：

```python
automation_hours = Column(Float, nullable=True)
parent_request_id = Column(Integer, ForeignKey("requests.id"), nullable=True)
```

### 5.3 API 变更明细

#### 5.3.1 `POST /requests` — 创建需求

新增可选字段 `parent_request_id`。

校验：
- 若提供，目标需求必须存在且 `status != 'deleted'`
- 创建时无自身 ID，跳过循环引用检测

#### 5.3.2 `PUT /requests/:id` — 编辑需求

新增可选字段 `parent_request_id`。

校验：
- 目标需求存在性 + 循环引用检测（沿 parent 链向上最多 10 层，不得包含当前 `request_id`）
- sales 可编辑字段列表新增 `parent_request_id`

#### 5.3.3 `POST /requests/:id/complete` — 完成任务

新增可选 Form 字段 `automation_hours`（REAL, ≥ 0），存入 `requests.automation_hours`。

#### 5.3.4 `GET /requests/:id` — 需求详情

响应新增字段：

```json
{
  "automation_hours": 16.0,
  "parent_request_id": 42,
  "parent_title": "XX基金申赎数据报告自动化建设",
  "children": [
    {"id": 55, "title": "2025年3月申赎数据报告", "status": "completed", "work_hours": 1.0, "completed_at": "..."},
    {"id": 68, "title": "2025年4月申赎数据报告", "status": "in_progress", "work_hours": null, "completed_at": null}
  ]
}
```

- `parent_title`：JOIN 查父需求 title
- `children`：`WHERE parent_request_id = :id AND status != 'deleted'`

#### 5.3.5 `GET /requests` — 需求列表

1. `scope=feed` 新增过滤：`Request.request_type != '工具/系统开发'`
2. 列表响应新增 `automation_hours` 和 `parent_request_id`（用于前端标签推导）

#### 5.3.6 `GET /requests/search-linkable` — 新增接口

用途：关联需求搜索框的数据源。

```
GET /api/v1/requests/search-linkable?keyword=申赎&limit=10

Response: [
  {"id": 42, "title": "XX基金申赎数据报告自动化建设", "researcher_name": "张三", "completed_at": "2025-01-15"},
  ...
]
```

- 搜索：`title LIKE '%keyword%'`
- 过滤：`status IN ('completed', 'in_progress')` AND `status != 'deleted'`
- 排序：`completed_at DESC, created_at DESC`
- 默认 limit=10
- 权限：所有已登录角色

#### 5.3.7 `GET /requests/feed-stats` — 需求动态统计

同步新增 `request_type != '工具/系统开发'` 过滤。

### 5.4 导出变更

Excel 导出新增两列：`自动化建设工时`（automation_hours）、`关联需求ID`（parent_request_id）。

---

## 6. 前端变更

### 6.1 常量文件

文件：`web/src/utils/constants.ts`

```typescript
export const REQUEST_TYPE_OPTIONS = [
  { label: '基金筛选', value: '基金筛选' },
  { label: '报告定制', value: '报告定制' },
  { label: '定期报告', value: '定期报告' },
  { label: '调研', value: '调研' },
  { label: '量化策略开发', value: '量化策略开发' },
  { label: '工具/系统开发', value: '工具/系统开发' },
  { label: '其他', value: '其他' },
];

export const RESEARCH_SCOPE_OPTIONS = [
  { label: '纯债', value: '纯债' },
  { label: '固收+', value: '固收+' },
  { label: '权益', value: '权益' },
  { label: '量化', value: '量化' },
  { label: '资产配置', value: '资产配置' },
  { label: '综合/行业', value: '综合/行业' },
  { label: '不涉及', value: '不涉及' },
];
```

### 6.2 TypeScript 类型

文件：`web/src/services/typings.d.ts`

`RequestItem` 新增：

```typescript
automation_hours?: number;
parent_request_id?: number;
parent_title?: string;
children?: { id: number; title: string; status: string; work_hours?: number; completed_at?: string }[];
```

### 6.3 API 层

文件：`web/src/services/api.ts`

1. `completeRequest`：FormData 新增可选 `automation_hours`
2. 新增函数：

```typescript
export async function searchLinkableRequests(keyword: string, limit = 10) {
  return request<{ id: number; title: string; researcher_name: string; completed_at?: string }[]>(
    '/api/v1/requests/search-linkable',
    { method: 'GET', params: { keyword, limit } },
  );
}
```

### 6.4 提交/编辑需求页面

文件：
- `web/src/pages/Sales/SubmitRequest/index.tsx`
- `web/src/pages/Admin/Settings/Requests/index.tsx`

改动：
1. 需求类型、研究范围下拉已引用常量，**自动跟随更新**
2. **新增「关联需求」搜索框**（`ProFormSelect` + `showSearch` + `debounce` 异步搜索）：
   - 输入关键词 → 调 `searchLinkableRequests` → 下拉展示匹配需求
   - 下拉选项格式：`标题 | 研究员 | 完成时间`
   - 选中存 `parent_request_id`
   - 位置：描述字段上方或研究员字段下方
3. **联动逻辑**：监听 `request_type` 变化，若切换到 `工具/系统开发`，自动 `form.setFieldsValue({ research_scope: '不涉及' })`

### 6.5 完成任务弹窗

文件：`web/src/pages/Researcher/MyTasks/index.tsx`

现有布局：处理说明 → 工时 → 协作研究员 → 上传附件

**改动：**

1. Modal 宽度改为 `width={640}`（原默认 520）以适配更多字段
2. `work_hours` 的 label 改为 `交付工时（小时）`
3. 在 `work_hours` 和协作研究员之间，新增：

```tsx
<Form.Item name="automation_hours" label="自动化建设工时（小时）">
  <InputNumber min={0} step={0.5} precision={1} style={{ width: '100%' }}
    placeholder="选填，如本次涉及自动化流程建设" />
</Form.Item>
```

4. `handleComplete` 提交时从表单取 `automation_hours` 传入 API

最终弹窗布局：

```
┌────────────────────────────────────────────────┐
│  完成任务                                        │
│                                                │
│  处理说明:          [________________________]    │
│  交付工时(小时):     [  8  ]                      │
│  自动化建设工时(小时): [    ]  (选填)               │
│                                                │
│  协作研究员    + 添加协作者                          │
│  [研究员 ▼] [工时]  ⊖                             │
│                                                │
│  上传附件:    [选择文件]                            │
│                                                │
│                        [取消]  [确认完成]           │
└────────────────────────────────────────────────┘
```

### 6.6 需求详情抽屉

文件：`web/src/components/RequestDetailDrawer/index.tsx`

新增展示（有值时才显示）：

1. **自动化标签**：当 `automation_hours > 0` 或 `parent_request_id != null` 时，在状态 Tag 旁展示 `<Tag color="blue">自动化</Tag>`
2. **自动化建设工时**：`automation_hours` 有值时，在工时相关字段旁新增一行展示
3. **关联原始需求**：`parent_request_id` 有值时，展示 `parent_title`，可点击打开该需求详情
4. **衍生需求列表**：`children` 非空时，在抽屉底部展示子表格（列：标题、状态、交付工时、完成时间），标题可点击跳转

### 6.7 列表页自动化标签

在需求标题列渲染中，满足自动化条件时在标题后展示小标签：

```tsx
render: (dom, entity) => (
  <span>
    <a onClick={() => openDetail(entity)}>{dom}</a>
    {(entity.automation_hours > 0 || entity.parent_request_id) && (
      <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>自动化</Tag>
    )}
  </span>
)
```

涉及文件：各页面的表格列定义（MyTasks、MyRequests、Admin Requests 等）。

### 6.8 自动跟随变更

以下页面引用了 `REQUEST_TYPE_OPTIONS` / `RESEARCH_SCOPE_OPTIONS`，常量更新后**无需额外改动**，但需全局验证：

- `web/src/pages/Sales/MyRequests/index.tsx`
- `web/src/pages/Sales/RequestFeed/index.tsx`
- `web/src/pages/Researcher/RequestFeed/index.tsx`
- `web/src/pages/Admin/Export/index.tsx`
- `web/src/pages/Admin/Dashboard/index.tsx`
- `web/src/components/RequestFeedTable/index.tsx`
- `web/src/components/FeedCharts/index.tsx`

---

## 7. 统计与分析影响

### 7.1 Admin Dashboard

- **研究员排行**：新增"自动化建设工时"列，总工时 = work_hours + automation_hours + collab_hours
- **需求类型饼图**：使用新分类值自动适配

### 7.2 需求动态图表 (`FeedCharts`)

- `request_type` 和 `research_scope` 聚合使用新值
- 数据源后端已排除 `工具/系统开发`

### 7.3 导出 Excel

新增两列：`自动化建设工时`、`关联需求ID`

### 7.4 未来扩展（本期不实现，数据已预留）

"自动化投入回报"视图：选中某条原始需求，展示自动化投入 vs 衍生需求节省工时的量化对比。

---

## 8. 分阶段实施计划

> 每个阶段完成后需验证通过再进入下一阶段。

### P0: 数据库变更 + 存量迁移

**前置：备份 `server/data/data.db`**

任务：
- [ ] 编写 `server/scripts/migrate_classification_automation.py`
  - 幂等 DDL（`PRAGMA table_info` 检查后 `ALTER TABLE`）
  - Dry-run 模式（`--dry-run`）
  - 5 条 UPDATE 映射旧值
  - 执行前 `sqlite3.backup()` 备份
  - 执行后打印 `DISTINCT` 验证
- [ ] 执行 dry-run → 确认行数 → 执行迁移
- [ ] 验证：无旧值残留，新字段存在且默认 NULL

### P1: 后端更新

任务：
- [ ] 更新 `constants.py` 中 `REQUEST_TYPES` / `RESEARCH_SCOPES`
- [ ] 更新 `models.py`：Request 新增 `automation_hours`、`parent_request_id`
- [ ] `POST /requests`：接受 `parent_request_id`，校验存在性
- [ ] `PUT /requests/:id`：同上 + 循环引用检测 + sales 可编辑字段新增
- [ ] `POST /:id/complete`：接受 `automation_hours` Form 字段
- [ ] `GET /:id`：响应新增 `automation_hours`、`parent_request_id`、`parent_title`、`children`
- [ ] `GET /requests`：feed 过滤新增 `request_type != '工具/系统开发'`；列表响应新增两字段
- [ ] 新增 `GET /requests/search-linkable`
- [ ] `GET /requests/feed-stats`：同步排除 `工具/系统开发`
- [ ] 导出 Excel 新增两列
- [ ] 清理 `__pycache__` → 重启 API → 验证各接口

### P2: 前端常量 + 表单更新

任务：
- [ ] 更新 `constants.ts` 两个 OPTIONS 数组
- [ ] 更新 `typings.d.ts` RequestItem 类型
- [ ] 更新 `api.ts`：completeRequest 支持 `automation_hours`；新增 `searchLinkableRequests`
- [ ] `SubmitRequest`：新增关联需求搜索框 + `工具/系统开发` 联动
- [ ] `MyTasks` 完成弹窗：Modal 加宽、label 改名、新增 `automation_hours` 输入
- [ ] `Admin Settings/Requests`：编辑弹窗新增关联需求字段

### P3: 前端详情展示 + 标签

任务：
- [ ] `RequestDetailDrawer`：自动化标签、建设工时、关联需求、衍生列表
- [ ] 各列表页标题列：自动化小标签
- [ ] 导出验证新增列

### P4: 统计面板适配

任务：
- [ ] `stats_service.py`：研究员排行新增 `automation_hours` 汇总
- [ ] `Admin Dashboard`：排行表新增列
- [ ] FeedCharts 验证新分类值聚合

### P5: 端到端测试 + 部署

任务：
- [ ] 新分类值：提交/筛选/编辑/导出
- [ ] 自动化工时：填写/展示/统计
- [ ] 关联需求：创建/展示/跳转
- [ ] feed 过滤：确认排除 `工具/系统开发`
- [ ] 存量数据：无旧值残留
- [ ] 生产部署：迁移脚本 → `nssm restart OpenSpec-API` → 前端 `npm run build`

**预估总工时：~4 天**
