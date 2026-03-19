# CLAUDE.md — OpenSpec (研究服务管理系统)

## 项目概述

OpenSpec 是一个前后端分离的需求/服务管理平台，服务于金融投研部门。销售提交研究需求，研究员接单完成并上传附件，管理员总览全局。从 Streamlit 单体重构而来，复用原有 SQLite 生产数据。

## 技术栈

- **后端**: FastAPI + SQLAlchemy 2.0 (同步) + SQLite + Pydantic v2 + APScheduler
- **前端**: React 18 + Umi 4 / @umijs/max + Ant Design Pro v6 + ProComponents + TypeScript
- **部署**: Windows Server → IIS → Nginx (8080) → uvicorn (8000), 全部 NSSM 服务化
- **子路径**: 生产环境挂载于 `/ty/rsm/`

## 项目路径 (生产服务器)

```
D:\jjy\demand_management_v2\
├── server/                     # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 入口, 路由挂载于 /api/v1
│   │   ├── core/               # config, database, security, deps, middleware, backup
│   │   ├── models/             # SQLAlchemy: user, request, team, organization, download_log
│   │   ├── schemas/            # Pydantic 校验
│   │   ├── api/                # 路由: auth, requests, users, organizations, teams, files, stats, exports, templates
│   │   ├── services/           # 业务逻辑层
│   │   └── utils/              # datetime_utils, export
│   ├── data/
│   │   ├── data.db             # 生产数据库 (勿直接操作)
│   │   ├── uploads/            # 附件: uploads/{request_id}/filename
│   │   └── backups/            # APScheduler 每日 3AM 自动备份
│   └── scripts/                # 迁移脚本 (幂等)
├── web/                        # React 前端
│   ├── src/
│   │   ├── pages/              # Sales/ Researcher/ Admin/ 三端页面
│   │   ├── components/         # RequestDetail, StatsCards, FileDownload, OrgSelectModal
│   │   ├── services/           # auth.ts, api.ts, admin.ts (API 调用)
│   │   ├── access.ts           # 路由权限
│   │   └── app.tsx             # 全局布局, RequestConfig (⚠️ 覆盖 requestErrorConfig)
│   └── dist/                   # 构建产物, Nginx 直接托管
└── docs/                       # proposal, project, database, api, business-rules, pages, tasks
```

## 核心业务模型

### 三角色

- **sales**: 提交需求、编辑自己的 pending/withdrawn 需求、重提交、取消、下载(需选机构)
- **researcher**: 接受/完成/退回(填原因)任务、代提需求、下载
- **admin**: 全部权限, 且同时兼具 sales + researcher 身份 (可被选为销售/研究员)

### 五状态

```
pending → in_progress   (researcher accept)
pending → withdrawn     (researcher withdraw, 必填 withdraw_reason)
withdrawn → pending     (sales resubmit)
withdrawn → canceled    (sales cancel)
pending → canceled      (sales cancel)
in_progress → completed (researcher complete, 可附文件+工时)
admin 可直接改任意状态
```

### 关键规则

- **保密需求** (`is_confidential=1`): 仅 admin / created_by / sales_id / researcher_id 可见, 后端 WHERE 过滤
- **Feed 模式**: 仅展示 `completed + !confidential`, 脱敏字段: org_name, department, work_hours, sales_id/name, is_confidential
- **下载日志**: 销售下载弹窗选机构 → `org_name` 记录的是"谁在下载"而非需求关联机构; 研究员/admin → `org_name=null`
- **软删除**: requests 用 `status="deleted"`, users/orgs/teams 用 `is_deleted=0/1`
- **机构权限链**: user.team_id → team_org_mapping → organizations (admin 无限制)

## 数据库表

users, requests, teams, organizations, team_org_mapping, download_logs — 全部 SQLite, 详见 `docs/database.md`。

系统配置表 `system_config` (key-value) 用于 researcher_max_tasks 等动态配置 (待实现)。

## API 约定

- Base: `/api/v1`, 全部 JWT Bearer 认证 (除 `/auth/login`)
- 统一响应包装: `{ "code": 0, "data": {...}, "message": "ok" }` (由 `ResponseWrapperMiddleware` 处理)
- `FileResponse` 绕过包装 (middleware 按 content-type 判断, 必须在读 body 前检查)

## 常见开发命令

```bash
# 后端
cd server
conda activate demand_management_v2
uvicorn app.main:app --reload --port 8000
# 生产重启
nssm restart OpenSpec-API

# 前端 (必须先退出 conda)
conda deactivate
cd web
npm run dev                           # 开发
$env:REACT_APP_ENV="prod"; npm run build  # 生产构建 (PowerShell)
# 前端变更只需 rebuild, 无需重启 Nginx

# Nginx 配置变更
nssm restart OpenSpec-Nginx
```

## ⚠️ 已知陷阱

1. **`__pycache__` 致幽灵 bug**: Windows + uvicorn 下, 改了源码但行为没变 → 递归删除 `__pycache__` 再重启
2. **`app.tsx` 的 `RequestConfig`**: 会覆盖 `requestErrorConfig.ts` 的 `API_BASE_URL` 前缀逻辑
3. **两处 raw `fetch`**: `admin.ts → exportFullExcel` 和 `FileDownloadButton/index.tsx → triggerDownload` 绕过拦截器, 需手动注入 `API_BASE_URL` 前缀
4. **Umi 动态导出**: `history`, `request`, `useModel` 等从 `@umijs/max` 导入, IDE 可能报错但运行时正常; 可在 `tsconfig.json` paths 中添加 `.umi` 路径消除
5. **Ant Design v5 静态方法**: `Modal.success()` / `message.error()` 在 `<App>` wrapper 内无效 → 用 `App.useApp()` hook
6. **`BaseHTTPMiddleware` + `FileResponse`**: `call_next()` 包装后 `isinstance` 检查失效, 需在读 body 前按 content-type 判断
7. **迁移脚本幂等性**: 用 `PRAGMA table_info` 检查列存在性, `ALTER TABLE ADD COLUMN` 前加 guard

## 协作规范

- **Phased development**: P0→P8 逐阶段推进, 每阶段有验证门控
- **Minimal diff**: 定向修复用 patch 指令, 避免全文件重写
- **Audit-first**: 实现前先审计现有代码与 docs/ 下规格文档的差异
- **确认门控**: 重大架构决策列选项让人类选择, 不自行决定
- **Git**: `feat(scope): xxx` / `fix(scope): xxx` 等 conventional commits

## 待实现模块

1. **知识库** (knowledge-base): 6 张新表, 文件上传 + 元数据标注 + 多维筛选 + 下载日志, 详见 `knowledge-base-proposal.md`
2. **研究员工作量上限**: `system_config` 表 + `researcher_max_tasks` + 容量展示下拉 + 409 溢出拦截
3. **多文件附件**: 存储结构已预留 (`uploads/{request_id}/`)
