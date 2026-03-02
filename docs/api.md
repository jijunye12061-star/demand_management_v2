# api.md — API 接口设计

> Base URL: `/api/v1`
> 认证: JWT Bearer Token (除 `/auth/login` 外全部需要)

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

| 参数 | 类型 | 说明 |
|------|------|------|
| status | str? | pending / in_progress / completed |
| request_type | str? | 需求类型 |
| research_scope | str? | 研究范畴 |
| org_type | str? | 客户类型 |
| researcher_id | int? | 研究员 ID |
| sales_id | int? | 销售 ID |
| keyword | str? | 标题/描述关键词搜索 |
| date_from | date? | 创建时间起 |
| date_to | date? | 创建时间止 |
| scope | str? | `mine` = 仅我的, `feed` = 需求动态 (已完成+公开), 默认按角色 |
| page | int | 页码, 默认 1 |
| page_size | int | 每页条数, 默认 20 |

```
Response: { "items": [RequestItem], "total": int }
```

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
编辑需求 (admin only)。
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
研究员撤回: pending 状态, 清空 researcher_id 归还销售。
```
权限: researcher (且为该需求的 researcher_id, 仅 pending 状态)
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
Response: FileResponse (streaming)
Side effect: 写入 download_logs
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
参数: role? (过滤角色)
Response: [UserItem]
```

### GET `/users/researchers`
研究员列表 (供下拉选择, 所有角色可用)。

### GET `/users/sales`
销售列表 (供研究员代提需求选择)。

### POST `/users`
创建用户。
```
Request: { "username", "password", "role", "display_name", "team_id?" }
```

### PUT `/users/:id`
编辑用户。

### DELETE `/users/:id`
删除用户。

### PUT `/users/:id/reset-password`
管理员重置用户密码。
```
Request: { "new_password": "str" }
```

---

## 5. 团队 (`/teams`) — admin only

### GET `/teams`
团队列表。

### POST `/teams`
创建团队。

### DELETE `/teams/:id`
删除团队。

### GET `/teams/:id/organizations`
获取团队关联的机构列表。

### PUT `/teams/:id/organizations`
设置团队关联机构 (全量替换)。
```
Request: { "org_ids": [int] }
```

### PUT `/teams/:id/members`
设置团队成员 (销售分配到团队)。
```
Request: { "user_ids": [int] }
```

---

## 6. 机构 (`/organizations`) — admin only

### GET `/organizations`
机构列表。
```
参数: team_id? (按团队过滤, 用于销售端下拉)
```

### GET `/organizations/by-team`
当前用户所属团队的机构列表 (销售/研究员可用)。

### POST `/organizations`
创建机构。

### PUT `/organizations/:id`
编辑机构。

### DELETE `/organizations/:id`
删除机构。

---

## 7. 统计 (`/stats`) — admin only

### GET `/stats/overview`
总览卡片数据。
```
参数: period (today / week / month / quarter / year)
Response: { total, pending, in_progress, completed, total_hours }
```

### GET `/stats/researcher-ranking`
研究员工作量排行。
```
参数: period
Response: [{ user_id, display_name, completed_count, work_hours, pending_count }]
```

### GET `/stats/researcher-matrix`
研究员 × 多时间维度矩阵。
```
Response: [{ display_name, today, week, month, quarter, year }]
```

### GET `/stats/type-matrix`
需求类型 × 多时间维度矩阵。

### GET `/stats/org-matrix`
客户/机构视角统计。

### GET `/stats/sales-matrix`
销售 × 多时间维度矩阵。

### GET `/stats/charts`
图表数据 (饼图 + 柱状图)。
```
参数: period
Response: {
  type_distribution: [{ name, value }],
  org_type_distribution: [{ name, value }],
  researcher_workload: [{ name, completed, in_progress, pending }]
}
```

### GET `/stats/downloads`
下载统计。
```
Response: {
  top_downloads: [{ request_id, title, total_count, unique_users }],
  recent_logs: [{ request_title, user_name, org_name, downloaded_at }]
}
```

---

## 8. 数据导出 (`/exports`) — admin only

### GET `/exports/requests`
导出 Excel。
```
参数: 同 GET /requests 的筛选参数
Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (streaming)
```

### GET `/exports/requests/preview`
导出预览 (前 20 条)。
```
参数: 同上
Response: { "items": [RequestItem], "total": int }
```
