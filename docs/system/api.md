# api.md — API 接口设计

> Base URL: `/api/v1`
> 认证: JWT Bearer Token (除 `/auth/login` 外全部需要)
> ⚠️ 响应格式: 以下各接口 Response 均为 `data` 部分的简写, 实际返回统一包装为
`{ "code": 0, "data": {...}, "message": "ok" }`, 详见 project.md §4

---

## 1. 认证 (`/auth`)

### POST `/auth/login`

登录获取 token。

```
Request:  { "username": "str", "password": "str" }
Response: { "access_token": "str", "refresh_token": "str", "user": UserInfo }
```

### POST `/auth/refresh`

刷新 access_token。

```
Request:  { "refresh_token": "str" }
Response: { "access_token": "str" }
```

### PUT `/auth/password`

当前用户修改自己的密码。

```
Request:  { "old_password": "str", "new_password": "str" }
Response: { "message": "ok" }
```

---

## 2. 需求 (`/requests`)

### GET `/requests`

查询需求列表 (自动按角色过滤可见范围 + 保密规则)。

| 参数             | 类型    | 说明                                                       |
|----------------|-------|----------------------------------------------------------|
| status         | str?  | pending / in_progress / completed / withdrawn / canceled |
| request_type   | str?  | 需求类型                                                     |
| research_scope | str?  | 研究范畴                                                     |
| org_type       | str?  | 客户类型                                                     |
| researcher_id  | int?  | 研究员 ID                                                   |
| sales_id       | int?  | 销售 ID                                                    |
| keyword        | str?  | 标题/描述关键词搜索                                               |
| date_from      | date? | 创建时间起                                                    |
| date_to        | date? | 创建时间止                                                    |
| scope          | str?  | `mine` = 仅我的, `feed` = 需求动态 (已完成+公开), 默认按角色              |
| page           | int   | 页码, 默认 1                                                 |
| page_size      | int   | 每页条数, 默认 20                                              |

```
Response: { "items": [RequestItem], "total": int }
```

**scope=feed 时字段过滤**:

- 返回: id, title, description, request_type, research_scope, org_type, researcher_id, researcher_name, completed_at,
  attachment_path, download_count
- 置 null: org_name, department, work_hours, sales_id, sales_name, is_confidential

**scope=mine 时可见性**:

- sales: `sales_id = 当前用户` 的所有需求 (排除 canceled)
- researcher: `researcher_id = 当前用户` 的需求 (排除 withdrawn 和 canceled) + `created_by = 当前用户` 的需求
- admin: 所有需求

### GET `/requests/:id`

需求详情 (含下载统计)。

### POST `/requests`

提交需求。

```
Request: {
  "title": "str",
  "description": "str?",
  "request_type": "str",
  "research_scope": "str?",
  "org_name": "str",
  "org_type": "str?",
  "department": "str?",
  "researcher_id": int,
  "is_confidential": bool?,
  "created_at": "datetime?",       // 支持回溯
  "sales_id": int?                  // 研究员代提时必填
}
```

### PUT `/requests/:id`

编辑需求。

**权限**:

- admin: 可编辑任意需求的任意字段
- sales: 仅可编辑自己创建的 `pending`/`withdrawn` 状态需求, 可编辑字段:
  title, description, request_type, research_scope, org_name, org_type, department, researcher_id, is_confidential

```
Request: { ...可编辑字段 }
```

### DELETE `/requests/:id`

删除需求 (admin only)。

### POST `/requests/:id/accept`

研究员接受任务: pending → in_progress。

```
权限: researcher (且为该需求的 researcher_id)
```

### POST `/requests/:id/complete`

研究员完成任务: in_progress → completed。

```
Request (multipart/form-data): {
  "result_note": "str?",
  "work_hours": float?,
  "attachment": File?
}
```

### POST `/requests/:id/withdraw`

研究员退回: pending 状态, 必须填写退回原因。

```
Request: { "reason": "str" }
权限: researcher (且为该需求的 researcher_id, 仅 pending 状态)
动作: status → 'withdrawn', 保留 researcher_id, 写入 withdraw_reason
```

### POST `/requests/:id/resubmit`

销售修改后重新提交: withdrawn → pending。

```
Request: {
  "title": "str?",
  "description": "str?",
  "request_type": "str?",
  "research_scope": "str?",
  "org_name": "str?",
  "org_type": "str?",
  "department": "str?",
  "researcher_id": int?             // 重新选择研究员
}
权限: sales (且为该需求的 sales_id 或 created_by, 仅 withdrawn 状态)
动作: 更新提交字段, status → 'pending', withdraw_reason → NULL
```

### POST `/requests/:id/cancel`

销售取消需求 (软删除): pending/withdrawn → canceled。

```
权限: sales (且为该需求的 sales_id 或 created_by) 或 admin
前置: status IN ('pending', 'withdrawn')
```

### PUT `/requests/:id/reassign`

管理员重新分配研究员。

```
Request: { "researcher_id": int }
权限: admin
```

### PUT `/requests/:id/confidential`

切换保密状态。

```
Request: { "is_confidential": bool }
权限: admin
```

---

## 3. 文件 (`/files`)

### GET `/files/download/:request_id`

下载附件 (自动记录下载日志)。

```
参数: org_name (str?, 销售下载时必传, 研究员/admin 不传)
Response: FileResponse (streaming)
Side effect: 写入 download_logs (org_name: 销售选择的机构 / 研究员和admin为null)
```

### POST `/files/upload`

独立上传接口 (备用, 主要上传在 complete 接口中)。

```
Request (multipart): { "file": File }
Response: { "path": "str" }
```

---

## 4. 用户管理 (`/users`) — admin only

### GET `/users`

用户列表。

```
参数: role?, keyword?
Response: { "items": [UserItem], "total": int }
```

### GET `/users/researchers`

获取研究员列表 (供下拉选择)。

```
返回: role IN ('researcher', 'admin') 的用户
Response: [{ "id": int, "display_name": "str", "team_id": int? }]
```

### GET `/users/sales`

获取销售列表 (供下拉选择)。

```
返回: role IN ('sales', 'admin') 的用户
Response: [{ "id": int, "display_name": "str", "team_id": int? }]
```

### POST `/users`

创建用户 (admin only)。

```
Request: { "username": "str", "password": "str", "role": "str", "display_name": "str", "team_id": int? }
```

### PUT `/users/:id`

编辑用户 (admin only)。

```
Request: { "display_name?": "str", "role?": "str", "team_id?": int }
```

### DELETE `/users/:id`

删除用户 (admin only)。

### PUT `/users/:id/reset-password`

重置密码 (admin only)。

```
Request: { "new_password": "str" }
```

---

## 5. 机构 (`/organizations`)

### GET `/organizations`

全部机构列表 (admin)。

### GET `/organizations/by-team`

按团队获取机构列表。

```
参数: team_id (int?, 不传则取当前用户 team_id; admin 且所选销售为 admin 时返回全部)
```

### POST `/organizations`

创建机构 (admin only)。

### PUT `/organizations/:id`

编辑机构 (admin only)。

### DELETE `/organizations/:id`

删除机构 (admin only)。

---

## 6. 团队 (`/teams`)

### GET `/teams`

团队列表 (含 org_count, member_count)。

### POST `/teams`

创建团队 (admin only)。

### DELETE `/teams/:id`

删除团队 (admin only)。

### GET `/teams/:id/organizations`

团队已分配的机构。

### PUT `/teams/:id/organizations`

全量替换团队机构。

```
Request: { "org_ids": [int] }
```

### PUT `/teams/:id/members`

全量替换团队成员。

```
Request: { "user_ids": [int] }
```

---

## 7. 统计 (`/stats`) — admin only

### GET `/stats/overview`

```
参数: period (today|week|month|quarter|year)
Response: { "total": int, "pending": int, "in_progress": int, "completed": int, "total_hours": float }
```

### GET `/stats/researcher-ranking`

```
参数: period
Response: [{ "user_id": int, "display_name": "str", "completed_count": int, "work_hours": float, "pending_count": int, "in_progress_count": int }]
```

### GET `/stats/researcher-matrix`

```
Response: [{ "name": "str", "today": int, "week": int, "month": int, "quarter": int, "year": int }]
```

### GET `/stats/type-matrix`

同上格式, 行=需求类型。

### GET `/stats/org-matrix`

| period | str? | 统计周期: today/week/month/quarter/year, 默认 year |
```
Response: [{ "name": "str", "count": int, "hours": float }]
```

### GET `/stats/sales-matrix`

同 researcher-matrix 格式, 行=销售。
现有的 `GET /stats/sales-matrix` 同理，实际代码调用的是 v2 版本，支持多周期列（today/week/month/quarter/year），不再是简单的 count+hours 格式。

### GET `/stats/charts`

```
参数: period
Response: {
  "type_distribution": [{ "name": "str", "value": int }],
  "org_type_distribution": [{ "name": "str", "value": int }],
  "researcher_workload": [{ "name": "str", "completed": int, "in_progress": int, "pending": int }]
}
```

### GET `/stats/downloads`

```
Response: {
  "top_downloads": [{ "request_id": int, "title": "str", "total_count": int, "unique_users": int }],
  "recent_logs": [{ "request_title": "str", "user_name": "str", "org_name": "str?", "downloaded_at": "str" }]
}
```

### GET `/stats/researcher-detail`
查询单个研究员的详细统计。
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | int | 研究员 ID |

### GET `/stats/type-detail`
查询单个需求类型的详细统计。
| 参数 | 类型 | 说明 |
|------|------|------|
| request_type | str | 需求类型 |

### GET `/stats/org-detail`
查询单个机构的详细统计。
| 参数 | 类型 | 说明 |
|------|------|------|
| org_name | str | 机构名称 |

### GET `/stats/sales-detail`
查询单个销售的详细统计。
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | int | 销售 ID |

---

## 8. 导出 (`/exports`)

### GET `/exports/requests`

导出 Excel 文件。

**权限与字段**:

- admin: 全字段导出, 参数同 `GET /requests` 的筛选参数
- sales/researcher: 仅导出 feed 可见的公开数据, 且仅包含展示字段 (title, description, request_type, research_scope,
  org_type, researcher_name, completed_at)

```
Response: StreamingResponse (Excel)
```

### GET `/exports/requests/preview`

导出预览 (admin only)。

```
参数: 同 GET /requests 筛选参数
Response: { "items": [RequestItem], "total": int }
```
