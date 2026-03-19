# CLAUDE.md — OpenSpec (研究服务管理系统)

## 项目概述

前后端分离的研究需求管理平台，服务金融投研部门。销售提交需求 → 研究员接单完成上传附件 → 管理员总览。从 Streamlit 重构而来，复用原有 SQLite 数据。

- **后端**: FastAPI + SQLAlchemy 2.0 (同步) + SQLite + Pydantic v2 + APScheduler
- **前端**: React 18 + Umi 4 / @umijs/max + Ant Design Pro v6 + ProComponents + TypeScript
- **部署**: Windows Server → IIS → Nginx (8080) → uvicorn (8000), 全部 NSSM 服务化
- **子路径**: 生产环境挂载于 `/ty/rsm/`

## 项目结构

```
server/app/          # FastAPI: core/ models/ schemas/ api/ services/ utils/
server/data/         # data.db (勿直接操作), uploads/{request_id}/, backups/
server/scripts/      # 迁移脚本 (幂等)
web/src/             # pages/{Sales,Researcher,Admin}/, components/, services/, app.tsx
web/dist/            # 构建产物, Nginx 直接托管
docs/system/         # 永久系统文档 (真相源, AI 每次读这里)
docs/features/       # 活跃 PRD, YYYYMM-name.md, 完成后删除
```

数据库: users, requests, teams, organizations, team_org_mapping, download_logs, system_config — 详见 `docs/system/database.md`

## 核心业务模型

**三角色**: sales (提交/编辑/取消/重提) | researcher (接受/完成/退回) | admin (全权 + 兼具两者身份)

**五状态**:
```
pending → in_progress   (researcher accept)
pending → withdrawn     (researcher withdraw, 必填 withdraw_reason)
withdrawn → pending     (sales resubmit)
withdrawn/pending → canceled  (sales cancel)
in_progress → completed (researcher complete, 可附文件+工时)
admin 可直接改任意状态
```

**关键规则**:
- **保密需求** (`is_confidential=1`): 仅 admin / created_by / sales_id / researcher_id 可见, 后端 WHERE 过滤
- **Feed 模式**: 仅展示 `completed + !confidential`, 脱敏: org_name, department, work_hours, sales_id/name
- **下载日志**: 销售弹窗选机构 → org_name 记"谁在下载"(非需求关联机构); 研究员/admin → org_name=null
- **软删除**: requests 用 `status="deleted"`, users/orgs/teams 用 `is_deleted`
- **机构权限链**: user.team_id → team_org_mapping → organizations (admin 无限制)

## API 约定

- Base: `/api/v1`, JWT Bearer 认证 (除 `/auth/login`)
- 统一响应: `{ "code": 0, "data": {...}, "message": "ok" }` (ResponseWrapperMiddleware)
- FileResponse 绕过包装 (middleware 需在读 body 前按 content-type 判断)

## 常见开发命令

### 开发环境（本地）
```bash
# 后端：启动开发服务器（热重载）
cd server && conda activate demand_management_v2
uvicorn app.main:app --reload --port 8000

# 前端：启动开发服务器（必须先 conda deactivate）
cd web && npm run dev
```

开发阶段前后端均通过本地服务调试，不使用 NSSM 服务管理。后端默认 `http://localhost:8000`，前端默认 `http://localhost:8001`（或 Umi 分配的端口）。
管理员账号为`{"username":"sangdazhuoma","password":"admin123"}`

### 生产环境（服务器 10.189.26.145）
```bash
# 后端重启
nssm restart OpenSpec-API

# 前端构建（PowerShell，构建产物直接替换 web/dist/，无需重启 Nginx）
$env:REACT_APP_ENV="prod"; npm run build

# Nginx 配置变更后重启
nssm restart OpenSpec-Nginx
```

开发完成并验证后，将代码同步到服务器，执行生产构建/重启部署。

## ⚠️ 已知陷阱

1. **`__pycache__` 幽灵 bug**: 改了源码行为没变 → 递归删除 `__pycache__` 再重启
2. **`app.tsx` RequestConfig**: 覆盖 `requestErrorConfig.ts` 的 API_BASE_URL 前缀逻辑
3. **两处 raw fetch**: `admin.ts→exportFullExcel` 和 `FileDownloadButton→triggerDownload` 绕过拦截器, 需手动注入 API_BASE_URL
4. **Umi 动态导出**: `history/request/useModel` 从 `@umijs/max` 导入, IDE 报错但运行时正常
5. **Ant Design v5 静态方法**: `Modal.success()` 在 `<App>` 内无效 → 用 `App.useApp()` hook
6. **BaseHTTPMiddleware + FileResponse**: `call_next()` 后 `isinstance` 检查失效, 需按 content-type 判断
7. **迁移脚本幂等性**: `PRAGMA table_info` 检查列存在, `ALTER TABLE ADD COLUMN` 前加 guard

## 协作规范

- **Minimal diff**: 定向修复用 patch, 避免全文件重写
- **Audit-first**: 实现前先审计代码与 `docs/system/` 的差异
- **确认门控**: 重大架构决策列选项让人类选择
- **Git**: conventional commits (`feat(scope):` / `fix(scope):` 等)

## 文档工作流

```
新功能 → docs/features/YYYYMM-name.md (PRD)
实施中 → .claude/progress/name.md (进度追踪, 不入 git)
完成后 → 更新 docs/system/ → 删 features/ PRD → 删 .claude/progress/
```

## 待实现模块

1. **知识库**: 6 张新表, 文件上传+元数据标注+多维筛选+下载日志 → `docs/features/202603-knowledge-base.md`
2. **研究员工作量上限**: system_config + researcher_max_tasks + 409 溢出拦截
3. **多文件附件**: 存储结构已预留 (`uploads/{request_id}/`)
