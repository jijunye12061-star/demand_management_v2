# 多研究员协作功能 — 产品方案 & 实施规格

> 版本: v1.0 | 日期: 2026-03-18
> 预计工期: 1-1.5 天

---

## 1. 功能概述

支持一个需求由多名研究员协作完成。主负责人 (`researcher_id`) 不变，流转逻辑（accept/complete/withdraw）完全不变。主负责人在「完成任务」时可添加协作者及其工时。所有展示研究员名字的地方统一显示为逗号分隔形式，如"张三, 李四"。

### 核心原则

- **零侵入流转**: accept/withdraw/reopen/revoke-accept 完全不改
- **complete 时追加**: 仅在 complete 接口扩展，接受可选的协作者列表
- **展示统一拼接**: 后端 query 时 JOIN 协作者表，返回拼接后的 `researcher_name` 字段
- **统计包含协作**: 协作者的工时纳入其个人统计

---

## 2. 数据库变更

### 2.1 新建表 `request_collaborators`

```sql
CREATE TABLE IF NOT EXISTS request_collaborators (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id    INTEGER NOT NULL REFERENCES requests(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    work_hours    REAL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_collab_request ON request_collaborators(request_id);
CREATE INDEX IF NOT EXISTS idx_collab_user ON request_collaborators(user_id);
```

**约束说明**:
- 同一需求同一用户不应重复添加（代码层去重，不加 UNIQUE 约束以简化）
- 主负责人 (`researcher_id`) 不应出现在协作者表中（代码层过滤）

### 2.2 迁移脚本

新建 `server/scripts/migrate_collaborators.py`，遵循项目已有的幂等迁移模式（参考 `migrate_v3.py`）：
- 检查表是否存在 → 不存在则 CREATE
- 检查索引是否存在 → 不存在则 CREATE INDEX
- 幂等，可安全重复运行

---

## 3. 后端变更

### 3.1 新增 Model

**文件**: `server/app/models/collaborator.py`

```python
from sqlalchemy import Integer, Float, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class RequestCollaborator(Base):
    __tablename__ = "request_collaborators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(Integer, ForeignKey("requests.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    work_hours: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[str | None] = mapped_column(String)
```

在 `server/app/models/__init__.py` 中导入新 Model。

### 3.2 修改 complete 接口

**文件**: `server/app/api/requests.py` — `POST /{request_id}/complete`

当前签名:
```python
async def complete(
    request_id: int, db: DB, user: CurrentUser,
    result_note: str = Form(None),
    work_hours: float = Form(None),
    attachment: UploadFile | None = File(None),
)
```

**变更**: 新增 `collaborators` Form 字段（JSON 字符串）:
```python
async def complete(
    request_id: int, db: DB, user: CurrentUser,
    result_note: str = Form(None),
    work_hours: float = Form(None),
    attachment: UploadFile | None = File(None),
    collaborators: str = Form(None),  # JSON: [{"user_id": 2, "work_hours": 3.0}, ...]
)
```

**处理逻辑** (在调用 `complete_request` 之后):
```python
import json

# ... existing complete logic ...

# 保存协作者
if collaborators:
    collab_list = json.loads(collaborators)  # [{user_id, work_hours}]
    for c in collab_list:
        # 过滤掉主负责人自己
        if c["user_id"] == user.id:
            continue
        db.add(RequestCollaborator(
            request_id=request_id,
            user_id=c["user_id"],
            work_hours=c.get("work_hours", 0),
            created_at=now_beijing(),
        ))
    db.commit()
```

### 3.3 修改 reopen 接口

**文件**: `server/app/api/requests.py` 或 `server/app/services/request_service.py`

当研究员撤销完成 (completed → in_progress) 时，**删除该需求的所有协作者记录**：

```python
# 在 reopen 逻辑中追加:
db.query(RequestCollaborator).filter(RequestCollaborator.request_id == request_id).delete()
db.commit()
```

> 理由: 撤销完成意味着任务回到进行中，之前填的协作者信息失效，下次完成时重新填写。

### 3.4 修改 query_requests (查询列表)

**文件**: `server/app/services/request_service.py` — `query_requests()` 函数

当前该函数 JOIN users 获取 `researcher_name`，返回字典列表。需要额外拼接协作者名字。

**策略**: 在 query_requests 返回的 items 上做批量后处理（避免改动核心查询 SQL）。

```python
from app.models.collaborator import RequestCollaborator

def query_requests(db, user, params):
    # ... existing query logic, returns items list and total ...

    # ── 批量拼接协作者名字 ──
    request_ids = [item["id"] for item in items]
    if request_ids:
        collabs = (
            db.query(
                RequestCollaborator.request_id,
                User.display_name,
            )
            .join(User, RequestCollaborator.user_id == User.id)
            .filter(RequestCollaborator.request_id.in_(request_ids))
            .order_by(RequestCollaborator.request_id, RequestCollaborator.id)
            .all()
        )
        # 按 request_id 分组
        collab_map: dict[int, list[str]] = {}
        for c in collabs:
            collab_map.setdefault(c.request_id, []).append(c.display_name)

        for item in items:
            rid = item["id"]
            if rid in collab_map:
                # 拼接: "主负责人, 协作者1, 协作者2"
                item["researcher_name"] = ", ".join(
                    [item.get("researcher_name") or ""] + collab_map[rid]
                ).strip(", ")

    return items, total
```

**注意**: `scope=feed` 模式也展示 `researcher_name`，所以这段逻辑对所有 scope 生效。

### 3.5 修改需求详情

如果项目中有 `GET /requests/:id` 单条详情接口，也需要拼接协作者。同时可以额外返回一个 `collaborators` 数组用于详情展示:

```python
# 在详情返回中追加:
collabs = (
    db.query(
        RequestCollaborator.user_id,
        User.display_name,
        RequestCollaborator.work_hours,
    )
    .join(User, RequestCollaborator.user_id == User.id)
    .filter(RequestCollaborator.request_id == request_id)
    .all()
)
result["collaborators"] = [
    {"user_id": c.user_id, "display_name": c.display_name, "work_hours": c.work_hours}
    for c in collabs
]
```

### 3.6 修改统计服务

**文件**: `server/app/services/stats_service.py`

#### 3.6.1 工时总览 (`get_overview`)

当前 `total_hours` 只统计 `requests.work_hours`。需要加上协作者工时:

```python
# 在 get_overview 返回前:
collab_hours = (
    db.query(func.coalesce(func.sum(RequestCollaborator.work_hours), 0))
    .join(Request, RequestCollaborator.request_id == Request.id)
    .filter(Request.status == "completed", Request.created_at >= start)
    .scalar()
)
result["total_hours"] = round((result["total_hours"] or 0) + (collab_hours or 0), 1)
```

#### 3.6.2 研究员排行 (`get_researcher_ranking`)

当前只按 `requests.researcher_id` 聚合。需要**额外统计每个研究员作为协作者的工时和件数**:

方案: 查询完主负责的统计后，再查一次协作者表聚合，合并到结果中。

```python
# 在 get_researcher_ranking 中:
# 1. 先查主负责的排行 (现有逻辑)
# 2. 再查协作者的工时/件数
collab_stats = (
    db.query(
        RequestCollaborator.user_id,
        func.count(RequestCollaborator.id).label("collab_count"),
        func.coalesce(func.sum(RequestCollaborator.work_hours), 0).label("collab_hours"),
    )
    .join(Request, RequestCollaborator.request_id == Request.id)
    .filter(Request.status == "completed", Request.completed_at >= start)
    .group_by(RequestCollaborator.user_id)
    .all()
)
collab_map = {r.user_id: (r.collab_count, r.collab_hours) for r in collab_stats}

# 3. 合并: 在每个研究员的结果中追加 collab_count, collab_hours
for row in result:
    uid = row["user_id"]
    cc, ch = collab_map.get(uid, (0, 0))
    row["collab_count"] = cc
    row["collab_hours"] = round(ch, 1)
    row["total_hours"] = round(row.get("work_hours", 0) + ch, 1)
```

#### 3.6.3 研究员详情 (`get_researcher_detail`)

同理，在个人详情的 summary 中增加协作工时:

```python
# 追加查询
collab_summary = (
    db.query(
        func.count(RequestCollaborator.id).label("collab_count"),
        func.coalesce(func.sum(RequestCollaborator.work_hours), 0).label("collab_hours"),
    )
    .join(Request, RequestCollaborator.request_id == Request.id)
    .filter(
        RequestCollaborator.user_id == user_id,
        Request.status == "completed",
    )
    .first()
)
result["summary"]["collab_count"] = collab_summary.collab_count or 0
result["summary"]["collab_hours"] = round(collab_summary.collab_hours or 0, 1)
```

### 3.7 Excel 导出

**文件**: `server/app/api/exports.py` (如果有)

导出 Excel 时，「研究员」列已经读取 `researcher_name` 字段，因为 query_requests 已经拼接了协作者名字，所以导出**无需额外改动**。

---

## 4. 前端变更

### 4.1 TypeScript 类型

**文件**: `web/src/services/typings.d.ts`

```typescript
// RequestItem 新增可选字段
export interface RequestItem {
  // ... existing fields ...
  collaborators?: { user_id: number; display_name: string; work_hours: number }[];
}

// 新增协作者类型 (用于 complete 表单)
export interface CollaboratorInput {
  user_id: number;
  work_hours: number;
}
```

### 4.2 修改 completeRequest API 调用

**文件**: `web/src/services/api.ts`

```typescript
export async function completeRequest(
  id: number,
  data: {
    result_note?: string;
    work_hours?: number;
    attachment?: File;
    collaborators?: CollaboratorInput[];  // 新增
  },
) {
  const formData = new FormData();
  if (data.result_note) formData.append('result_note', data.result_note);
  if (data.work_hours !== undefined) formData.append('work_hours', String(data.work_hours));
  if (data.attachment) formData.append('attachment', data.attachment);
  // 协作者以 JSON 字符串传入 (multipart form 不支持嵌套对象)
  if (data.collaborators?.length) {
    formData.append('collaborators', JSON.stringify(data.collaborators));
  }

  return request(`/api/v1/requests/${id}/complete`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
  });
}
```

### 4.3 修改完成任务弹窗

**文件**: `web/src/pages/Researcher/MyTasks/index.tsx`

在「完成任务 Modal」中，**在工时字段和上传附件之间**插入协作者动态表单:

```tsx
{/* 协作研究员 (可选) */}
<Form.List name="collaborators">
  {(fields, { add, remove }) => (
    <>
      <div style={{ marginBottom: 8 }}>
        <span>协作研究员</span>
        <Button type="link" size="small" onClick={() => add()}>
          + 添加协作者
        </Button>
      </div>
      {fields.map(({ key, name, ...restField }) => (
        <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
          <Form.Item
            {...restField}
            name={[name, 'user_id']}
            rules={[{ required: true, message: '请选择' }]}
          >
            <Select
              placeholder="选择研究员"
              showSearch
              optionFilterProp="label"
              options={researcherOptions}  // 从 getResearchers() 加载
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item
            {...restField}
            name={[name, 'work_hours']}
            rules={[{ required: true, message: '请填工时' }]}
          >
            <InputNumber min={0} step={0.5} precision={1} placeholder="工时" style={{ width: 100 }} />
          </Form.Item>
          <MinusCircleOutlined onClick={() => remove(name)} />
        </Space>
      ))}
    </>
  )}
</Form.List>
```

**handleComplete 提交逻辑修改**:

```typescript
const handleComplete = async () => {
  const values = await completeForm.validateFields();
  setSubmitting(true);
  try {
    await completeRequest(completingId!, {
      result_note: values.result_note,
      work_hours: values.work_hours,
      attachment: fileList[0]?.originFileObj,
      collaborators: values.collaborators || [],  // 新增
    });
    message.success('任务已完成');
    // ... existing cleanup ...
  } finally {
    setSubmitting(false);
  }
};
```

**研究员选项加载**: 在组件 mount 或 complete modal 打开时调用 `getResearchers()` 获取研究员列表，缓存为 `researcherOptions` state。需要排除当前用户自己 (`currentUserId`)。

```typescript
const [researcherOptions, setResearcherOptions] = useState<{label: string; value: number}[]>([]);

// 在 completeModal 打开时加载
useEffect(() => {
  if (completeModalVisible) {
    getResearchers().then(list => {
      setResearcherOptions(
        list
          .filter(u => u.id !== currentUserId)  // 排除自己
          .map(u => ({ label: u.display_name, value: u.id }))
      );
    });
  }
}, [completeModalVisible]);
```

### 4.4 需求详情抽屉

**文件**: `web/src/components/RequestDetailDrawer/index.tsx`

在「研究员」展示位置，`researcher_name` 已经由后端拼接了协作者名字（如 "张三, 李四"），所以**列表展示无需改动**。

在详情 Drawer 中，如果后端返回了 `collaborators` 数组且不为空，可以展示协作者明细:

```tsx
{/* 在 ProDescriptions 中追加 */}
<ProDescriptions.Item dataIndex="researcher_name" label="研究员" />

{/* 协作者工时明细 (仅非 feed 模式且有协作者时显示) */}
{!isFeed && request.collaborators?.length > 0 && (
  <ProDescriptions.Item label="协作工时明细" span={2}>
    {request.collaborators.map(c => (
      <Tag key={c.user_id}>{c.display_name}: {c.work_hours}h</Tag>
    ))}
  </ProDescriptions.Item>
)}
```

### 4.5 其他列表页面的研究员列

以下页面有「研究员」列展示 `researcher_name`，由于后端已拼接协作者，**无需改动**:

- `web/src/pages/Sales/MyRequests/index.tsx`
- `web/src/pages/Admin/Settings/Requests/index.tsx`
- `web/src/components/RequestFeedTable/index.tsx`
- `web/src/pages/Researcher/MyTasks/index.tsx`

但需注意列宽：原来 `researcher_name` 是单人名字（~4字），现在可能变长。建议把相关列的 `width` 从 80 调到 120，并加 `ellipsis: true`。

---

## 5. 不改动的部分（确认清单）

| 模块 | 是否改动 | 说明 |
|---|---|---|
| accept 接口 | ❌ 不改 | 流转逻辑不变 |
| withdraw 接口 | ❌ 不改 | 退回逻辑不变 |
| revoke-accept 接口 | ❌ 不改 | 撤销接受不变 |
| cancel 接口 | ❌ 不改 | 取消逻辑不变 |
| reassign 接口 | ❌ 不改 | 重新分配只改 researcher_id |
| 提交需求页面 | ❌ 不改 | 提交时只选主研究员 |
| 保密机制 | ❌ 不改 | 保密检查仍基于 researcher_id |
| 下载日志 | ❌ 不改 | 无关协作 |
| 模板功能 | ❌ 不改 | 模板只涉及需求创建 |

---

## 6. 迁移 & 部署步骤

```powershell
# 1. 备份数据库
copy D:\jjy\demand_management_v2\server\data\data.db D:\jjy\demand_management_v2\server\data\data.db.bak

# 2. 运行迁移脚本
cd D:\jjy\demand_management_v2\server
conda activate demand_management_v2
python scripts/migrate_collaborators.py

# 3. 清理 __pycache__（Windows/uvicorn 必须）
Get-ChildItem -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force

# 4. 重启后端服务
nssm restart OpenSpec-API

# 5. 构建前端
conda deactivate
cd D:\jjy\demand_management_v2\web
$env:REACT_APP_ENV="prod"
npm run build

# 6. 无需重启 Nginx（纯静态文件更新）
```

---

## 7. 测试要点

1. **完成任务（无协作者）**: 和现有行为完全一致，collaborators 字段不传
2. **完成任务（有协作者）**: 添加 1-2 个协作者 + 各自工时 → 检查列表 researcher_name 拼接
3. **需求详情**: 检查协作者工时明细展示
4. **撤销完成 (reopen)**: 确认协作者记录被清除
5. **再次完成**: 重新填写协作者
6. **统计看板**: 确认协作者工时计入其个人排行
7. **Excel 导出**: 确认研究员列展示拼接后的名字
8. **需求动态 (feed)**: 确认 researcher_name 包含协作者
9. **边界**: 不选协作者直接完成（兼容现有行为）
