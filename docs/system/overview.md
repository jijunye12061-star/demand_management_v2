# OpenSpec — 系统概述

> 金融投研部门研究服务管理平台。销售提交研究需求，研究员接单完成并上传附件，管理员总览全局。
> 从 Streamlit 单体重构而来，复用原有 SQLite 生产数据。

---

## 技术栈

| 层     | 选型                                      |
|-------|-----------------------------------------|
| 后端    | FastAPI + SQLAlchemy 2.0 (同步) + Pydantic v2 + APScheduler |
| 数据库   | SQLite（`data/data.db`），WAL 模式，`DATABASE_URL` 抽象可切换 PG |
| 认证    | JWT Bearer，access_token 24h / refresh_token 7d |
| 前端    | React 18 + Umi 4 / @umijs/max + Ant Design Pro v6 |
| 图表    | Recharts                                |
| 部署    | Windows Server → IIS → Nginx (8080) → uvicorn (8000)，NSSM 服务化 |
| 子路径   | 生产挂载于 `/ty/rsm/`                        |

---

## 角色模型

| 角色           | 能力                                              |
|--------------|-------------------------------------------------|
| `sales`      | 提交需求、编辑自己的 pending/withdrawn 需求、重提交、取消、下载（需选机构） |
| `researcher` | 接受/完成/退回任务（填原因）、代提需求、下载                        |
| `admin`      | 全部权限，同时兼具 sales + researcher 身份（可被选为销售/研究员）     |

---

## 状态流转

```
pending ──→ in_progress   (researcher accept)
pending ──→ withdrawn     (researcher withdraw，必填 withdraw_reason)
pending ──→ canceled      (sales cancel)
withdrawn → pending       (sales resubmit)
withdrawn → canceled      (sales cancel)
in_progress → completed   (researcher complete，可附文件 + 工时 + 协作者)
admin 可直接变更任意状态
```

---

## 核心规则

**保密需求** (`is_confidential=1`)
仅 admin / created_by / sales_id / researcher_id 可见，后端 WHERE 过滤。

**Feed 模式**（公开浏览）
仅展示 `completed + !confidential`，脱敏字段：org_name、department、work_hours、sales_id/name、is_confidential。

**下载日志**
销售下载时弹窗选机构，`org_name` 记录的是"谁在下载"而非需求关联机构；研究员/admin 下载时 `org_name=null`。

**多研究员协作**
研究员完成任务时可指定协作者及各自工时，写入 `request_collaborators` 表。
列表 `researcher_name` 拼接协作者姓名，`total_work_hours` = 主负责 + 协作工时之和。
统计（排行/看板/矩阵）均计入协作件数与工时；矩阵合计行为唯一需求数。

**软删除**
requests 用 `status="deleted"`，users/orgs/teams 用 `is_deleted=0/1`。

**机构权限链**
user.team_id → team_org_mapping → organizations（admin 无限制）。

---

## 主要模块

| 模块       | 入口                              | 说明                               |
|----------|---------------------------------|----------------------------------|
| 需求管理     | `/api/v1/requests`              | CRUD + 状态流转 + 协作者                |
| 附件       | `/api/v1/files`                 | 上传/下载，路径 `uploads/{request_id}/` |
| 统计       | `/api/v1/stats`                 | 总览/排行/矩阵/图表/研究员明细               |
| 导出       | `/api/v1/exports`               | 全字段 Excel（admin only）           |
| 用户/机构/团队 | `/api/v1/users` 等               | CRUD，软删除                         |
| 数据备份     | APScheduler 每日 3AM 自动备份至 `data/backups/` | —                  |

---

## 待实现功能

| 功能         | 文档                                      |
|------------|-----------------------------------------|
| 知识库        | `docs/features/202603-knowledge-base.md` |
| 研究员工作量上限   | `system_config` 表 + `researcher_max_tasks` + 409 溢出拦截 |
