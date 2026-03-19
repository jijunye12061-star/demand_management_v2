# business-rules.md — 业务规则

---

## 1. 角色权限矩阵

### 1.1 API 级权限

| 资源            | 操作                          | sales                      | researcher       | admin     |
|---------------|-----------------------------|----------------------------|------------------|-----------|
| requests      | 列表 (mine)                   | ✅                          | ✅                | ✅         |
| requests      | 列表 (feed)                   | ✅                          | ✅                | ✅         |
| requests      | 创建                          | ✅                          | ✅ (代提)           | ✅         |
| requests      | 编辑 (自己的, pending/withdrawn) | ✅                          | ❌                | —         |
| requests      | 编辑 (任意)                     | ❌                          | ❌                | ✅         |
| requests      | 删除                          | ❌                          | ❌                | ✅         |
| requests      | 接受                          | ❌                          | ✅ (自己的)          | ❌         |
| requests      | 完成                          | ❌                          | ✅ (自己的)          | ❌         |
| requests      | 退回 (withdraw)               | ❌                          | ✅ (自己的, pending) | ❌         |
| requests      | 重新提交 (resubmit)             | ✅ (自己的, withdrawn)         | ❌                | ❌         |
| requests      | 取消 (cancel)                 | ✅ (自己的, pending/withdrawn) | ❌                | ❌         |
| requests      | 重新分配                        | ❌                          | ❌                | ✅         |
| files         | 下载                          | ✅ (有权限, 需选机构)              | ✅ (有权限)          | ✅         |
| exports       | feed 导出                     | ✅ (仅展示字段)                  | ✅ (仅展示字段)        | ✅ (仅展示字段) |
| exports       | 全量导出                        | ❌                          | ❌                | ✅         |
| users         | CRUD                        | ❌                          | ❌                | ✅         |
| teams         | CRUD                        | ❌                          | ❌                | ✅         |
| organizations | CRUD                        | ❌                          | ❌                | ✅         |
| organizations | 按团队查询                       | ✅                          | ✅                | ✅         |
| stats         | 所有                          | ❌                          | ❌                | ✅         |

### 1.2 前端路由权限

```typescript
// access.ts
export default {
    '/sales': ['sales'],
    '/researcher': ['researcher'],
    '/admin': ['admin'],
}
```

### 1.3 Admin 兼容规则

admin 同时具备研究员和销售身份:

- `GET /users/researchers` → 返回 `role IN ('researcher', 'admin')`
- `GET /users/sales` → 返回 `role IN ('sales', 'admin')`
- admin 被选为销售时, 机构列表显示全部 (不受团队限制)
- admin 被指派为研究员时, 正常接受/完成/退回任务 (通过管理端需求管理页操作)

---

## 2. 需求可见性规则

### 2.1 "我的需求" 模式 (scope=mine)

| 角色         | 可见范围                                                                           |
|------------|--------------------------------------------------------------------------------|
| sales      | `sales_id = 当前用户` 的所有需求 (排除 canceled)                                          |
| researcher | `researcher_id = 当前用户` 的需求 (排除 withdrawn 和 canceled) + `created_by = 当前用户` 的需求 |
| admin      | 所有需求                                                                           |

> **研究员退回后**: withdrawn 状态的需求不再出现在研究员的任务列表中, 但 `researcher_id` 保留用于审计。

### 2.2 "需求动态" 模式 (scope=feed)

**基础条件**: `status = 'completed'` AND `is_confidential = 0` AND `request_type != '工具/系统开发'`

> `工具/系统开发` 属内部基建，不面向客户展示，硬编码排除。

所有角色看到的内容一致 — 已完成的公开需求。

**字段过滤** (后端强制, scope=feed 时):

- ✅ 返回: id, title, description, request_type, research_scope, org_type, researcher_id, researcher_name, completed_at,
  attachment_path, download_count
- ❌ 置 null: org_name, department, work_hours, sales_id, sales_name, is_confidential

### 2.3 保密需求过滤

当 `is_confidential = 1` 时, 该需求仅以下人可见:

- admin (任何管理员)
- `created_by` = 该用户
- `sales_id` = 该用户
- `researcher_id` = 该用户

**后端实现**: 在 `request_service.py` 的查询中注入 WHERE 条件, 而非前端过滤。

---

## 3. 状态流转规则

```
pending ──→ in_progress      (研究员 accept)
pending ──→ withdrawn        (研究员 withdraw: 填退回原因)
withdrawn ──→ pending        (销售 resubmit: 修改后重新提交)
withdrawn ──→ canceled       (销售 cancel: 放弃需求)
pending ──→ canceled         (销售 cancel: 撤回未处理需求)
in_progress → completed      (研究员 complete)
任何状态 ──→ 任何状态         (admin 编辑: 可直接改状态)
任何状态 ──→ 重新分配         (admin reassign: 可改 researcher_id)
```

### 3.1 接受任务 (accept)

- 前置: `status = 'pending'` AND `researcher_id = current_user.id`
- 动作: `status → 'in_progress'`, `updated_at = now()`

### 3.2 完成任务 (complete)

- 前置: `status = 'in_progress'` AND `researcher_id = current_user.id`
- 动作: `status → 'completed'`, `completed_at = now()`, 保存附件/说明/工时
- 可选字段: `work_hours`（交付工时）、`automation_hours`（自动化建设工时，独立记录）

### 3.3 退回 (withdraw)

- 前置: `status = 'pending'` AND `researcher_id = current_user.id`
- 必填: `withdraw_reason` (退回原因)
- 动作: `status → 'withdrawn'`, `withdraw_reason = reason`, `updated_at = now()`
- 注意: **保留 researcher_id** (记录谁退回的), 不清空

### 3.4 重新提交 (resubmit)

- 前置: `status = 'withdrawn'` AND (`sales_id = current_user.id` OR `created_by = current_user.id`)
- 可编辑字段: title, description, request_type, research_scope, org_name, org_type, department, researcher_id
- 动作: `status → 'pending'`, `withdraw_reason → NULL`, `updated_at = now()`, 更新各编辑字段

### 3.5 取消需求 (cancel)

- 前置: `status IN ('pending', 'withdrawn')` AND (`sales_id = current_user.id` OR `created_by = current_user.id` OR
  `role = 'admin'`)
- 动作: `status → 'canceled'`, `updated_at = now()`
- canceled 需求从默认列表查询中过滤, 但保留用于审计

### 3.6 销售编辑 (edit)

- 前置: `status IN ('pending', 'withdrawn')` AND (`sales_id = current_user.id` OR `created_by = current_user.id`)
- 可编辑字段: title, description, request_type, research_scope, org_name, org_type, department, researcher_id,
  is_confidential, parent_request_id
- 动作: 更新字段, `updated_at = now()`
- 注意: 编辑不改变状态。若为 withdrawn 状态需要重回 pending, 应使用 resubmit。

---

## 4. 机构权限链

```
用户登录 → users.team_id
         → team_org_mapping WHERE team_id = ?
         → organizations WHERE id IN (mapped org_ids)
         → 返回机构列表供表单选择
```

- 销售只能选择所属团队关联的机构
- 研究员代提需求时, 机构列表取所选销售的团队机构
- **admin 被选为销售时**: 机构列表显示全部 (admin 无 team_id 限制)
- admin 可见所有机构

---

## 5. 部门级联规则

```
org_type 变化时:
  if org_type in ["银行", "券商", "保险"]:
      显示 department 下拉, 选项从 DEPARTMENT_MAP[org_type] 获取
  else:
      隐藏 department, 值设为 null
```

---

## 6. 工时统计规则

- 单位: 小时, 精度 1 位小数
- 仅 `completed` 状态的需求计入统计
- 按 `completed_at` 时间归属到对应统计周期 (非 created_at)
- **总工时 = `work_hours`（交付工时）+ `automation_hours`（自动化建设工时）+ 协作者工时之和**
- `automation_hours` 为可选，未填时视为 0，不影响普通需求统计

## 6.1 自动化工时体系

研究员首次建设自动化流程时，`automation_hours` 记录建设投入；后续基于该流程产出的需求通过 `parent_request_id` 关联原始需求，形成"原始→衍生"链，用于量化自动化投入回报。

**推导规则（前端展示"自动化"标签）**:
```
显示自动化标签 = automation_hours > 0 OR parent_request_id IS NOT NULL
```

**关联约束**:
- 单亲: 一个需求最多一个 `parent_request_id`
- 循环引用校验: 沿 parent 链向上最多 10 层, 不得回到自身
- 关联搜索范围: `status IN ('completed', 'in_progress')` 的需求

---

## 7. 下载日志规则

- 触发时机: 用户点击下载按钮
- **销售下载**: 弹窗选择机构 (调 `/organizations/by-team` 获取机构列表), 选好后发起下载请求并携带 `org_name` 参数
- **研究员/admin 下载**: 直接下载, `org_name` 记录为 null
- 日志字段: `request_id`, `user_id`, `org_name` (销售选择的机构, 非需求关联机构), `downloaded_at`
- 用途: 追踪哪些机构对哪些需求成果感兴趣 (场景: 机构B下载了机构A提出的需求成果)
- 统计查询: 批量聚合, 避免 N+1

---

## 8. 附件存储规则

- 存储路径: `uploads/{request_id}/filename`
- 按需求 ID 建子目录, 为后续多文件扩展预留结构
- 本期每个需求仅支持单文件上传
- `attachment_path` 字段存储相对路径
