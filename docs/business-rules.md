# business-rules.md — 业务规则

---

## 1. 角色权限矩阵

### 1.1 API 级权限

| 资源 | 操作 | sales | researcher | admin |
|------|------|-------|------------|-------|
| requests | 列表 (mine) | ✅ | ✅ | ✅ |
| requests | 列表 (feed) | ✅ | ✅ | ✅ |
| requests | 创建 | ✅ | ✅ (代提) | ✅ |
| requests | 编辑 | ❌ | ❌ | ✅ |
| requests | 删除 | ❌ | ❌ | ✅ |
| requests | 接受 | ❌ | ✅ (自己的) | ❌ |
| requests | 完成 | ❌ | ✅ (自己的) | ❌ |
| requests | 撤回 | ❌ | ✅ (自己的, pending) | ❌ |
| requests | 重新分配 | ❌ | ❌ | ✅ |
| files | 下载 | ✅ (有权限) | ✅ (有权限) | ✅ |
| users | CRUD | ❌ | ❌ | ✅ |
| teams | CRUD | ❌ | ❌ | ✅ |
| organizations | CRUD | ❌ | ❌ | ✅ |
| organizations | 按团队查询 | ✅ | ✅ | ✅ |
| stats | 所有 | ❌ | ❌ | ✅ |
| exports | 所有 | ❌ | ❌ | ✅ |

### 1.2 前端路由权限

```typescript
// access.ts
export default {
  '/sales':      ['sales'],
  '/researcher': ['researcher'],
  '/admin':      ['admin'],
}
```

---

## 2. 需求可见性规则

### 2.1 "我的需求" 模式 (scope=mine)

| 角色 | 可见范围 |
|------|---------|
| sales | `sales_id = 当前用户` 的所有需求 |
| researcher | `researcher_id = 当前用户` 的需求 + `created_by = 当前用户` 的需求 |
| admin | 所有需求 |

### 2.2 "需求动态" 模式 (scope=feed)

**基础条件**: `status = 'completed'` AND `is_confidential = 0`

所有角色看到的内容一致 — 已完成的公开需求。

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
pending ──→ in_progress   (研究员 accept)
pending ──→ pending       (研究员 withdraw: 清空 researcher_id)
in_progress → completed   (研究员 complete)
任何状态 ──→ 任何状态      (admin 编辑: 可直接改状态)
任何状态 ──→ 重新分配      (admin reassign: 可改 researcher_id)
```

### 3.1 接受任务 (accept)

- 前置: `status = 'pending'` AND `researcher_id = current_user.id`
- 动作: `status → 'in_progress'`, `updated_at = now()`

### 3.2 完成任务 (complete)

- 前置: `status = 'in_progress'` AND `researcher_id = current_user.id`
- 动作: `status → 'completed'`, `completed_at = now()`, 保存附件/说明/工时

### 3.3 撤回 (withdraw)

- 前置: `status = 'pending'` AND `researcher_id = current_user.id`
- 动作: `researcher_id → NULL`, 状态保持 `pending`

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

---

## 7. 下载日志规则

- 触发时机: 用户点击下载按钮, 前端先调 `/files/download/:id`, 后端在返回文件流的同时写入日志
- 日志字段: `request_id`, `user_id`, `org_name` (取 request 的 org_name), `downloaded_at`
- 统计查询: 批量聚合, 避免 N+1
