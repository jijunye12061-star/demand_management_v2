# tasks.md — 原子任务拆解

> 按阶段和依赖关系排列, 每个任务为最小可交付单元
> 预估时间为单人开发参考

---

## Phase 0: 项目初始化

### P0-1 后端项目骨架
- 创建 `server/` 目录结构 (参照 project.md)
- 初始化 `requirements.txt`: fastapi, uvicorn, sqlalchemy, pydantic, python-jose, passlib[bcrypt], python-multipart, openpyxl
- 编写 `app/core/config.py`: 使用 pydantic-settings 管理 DATABASE_URL, SECRET_KEY, UPLOAD_DIR 等
- 编写 `app/main.py`: FastAPI 实例, CORS 配置, 路由挂载
- 验证: `uvicorn app.main:app --reload` 启动成功, 访问 `/docs` 看到空文档
- ⏱️ 0.5h

### P0-2 数据库连接层
- `app/core/database.py`: SQLAlchemy 2.0 engine + SessionLocal
- 适配现有 SQLite data.db (WAL mode)
- `get_db()` 依赖注入函数
- 验证: 启动时能连接现有数据库
- ⏱️ 0.5h

### P0-3 SQLAlchemy 模型映射
- 按 database.md 创建 5 个模型文件, 精确映射现有表结构
- `models/user.py`: User
- `models/request.py`: Request
- `models/team.py`: Team, TeamOrgMapping
- `models/organization.py`: Organization
- `models/download_log.py`: DownloadLog
- **不执行 create_all**, 仅映射 (表已存在)
- 验证: 能从现有 data.db 查询出数据
- ⏱️ 1h

### P0-4 前端项目初始化
- `npm create umi` 或 `pro create` 初始化 Ant Design Pro v6 项目
- 清理默认页面和示例代码
- 配置代理: `config/proxy.ts` → `/api` 转发 `localhost:8000`
- 配置中文: `config/config.ts` locale 设为 zh-CN
- 验证: `npm run dev` 启动成功, 看到默认布局
- ⏱️ 0.5h

---

## Phase 1: 认证体系

### P1-1 JWT 工具模块
- `app/core/security.py`:
  - `create_access_token(user_id, role)` → JWT 签发
  - `create_refresh_token(user_id)` → 刷新 token
  - `verify_token(token)` → 解码
  - `hash_password(plain)` → bcrypt
  - `verify_password(plain, hashed)` → 验证 (兼容 SHA256 legacy)
- ⏱️ 1h

### P1-2 认证依赖注入
- `app/core/deps.py`:
  - `get_current_user(token)` → 从 Header 提取 JWT, 查库返回 User
  - `require_role(*roles)` → 角色鉴权装饰器
- ⏱️ 0.5h

### P1-3 认证 API
- `app/api/auth.py`:
  - `POST /auth/login` → 验证密码 (SHA256 兼容 + bcrypt 自动升级), 返回双 token + user info
  - `POST /auth/refresh` → 刷新 token
  - `PUT /auth/password` → 改密码
- `app/schemas/auth.py`: LoginRequest, TokenResponse, ChangePasswordRequest
- 验证: 用现有用户 (SHA256 密码) 登录成功, 拿到 token
- ⏱️ 1.5h

### P1-4 前端登录页 + Token 管理
- `pages/Login/index.tsx`: ProForm 登录表单
- `services/auth.ts`: login(), refresh(), changePassword()
- Token 存储: localStorage
- 请求拦截器: 自动注入 Authorization header, 401 时跳转登录
- `app.tsx`: `getInitialState()` 获取当前用户信息
- 验证: 登录后跳转到对应角色首页
- ⏱️ 2h

### P1-5 前端权限路由
- `access.ts`: 根据 user.role 控制菜单可见性
- `config/routes.ts`: 完整路由配置 (参照 pages.md)
- 侧边栏菜单: 根据角色只显示对应端
- 验证: sales 登录只能看到销售端菜单
- ⏱️ 1h

---

## Phase 2: 基础数据 API (admin 端依赖)

### P2-1 用户 API
- `app/api/users.py`:
  - `GET /users` (admin)
  - `GET /users/researchers` (全角色, 下拉用)
  - `GET /users/sales` (全角色, 下拉用)
  - `POST /users` (admin)
  - `PUT /users/:id` (admin)
  - `DELETE /users/:id` (admin)
  - `PUT /users/:id/reset-password` (admin)
- `app/schemas/user.py`: UserCreate, UserUpdate, UserResponse
- ⏱️ 2h

### P2-2 机构 API
- `app/api/organizations.py`:
  - `GET /organizations` (admin, 可选 team_id 过滤)
  - `GET /organizations/by-team` (根据当前用户 team_id)
  - `POST /organizations` (admin)
  - `PUT /organizations/:id` (admin)
  - `DELETE /organizations/:id` (admin)
- `app/schemas/organization.py`
- ⏱️ 1h

### P2-3 团队 API
- `app/api/teams.py`:
  - `GET /teams` (admin)
  - `POST /teams` (admin)
  - `DELETE /teams/:id` (admin)
  - `GET /teams/:id/organizations`
  - `PUT /teams/:id/organizations` (批量设置)
  - `PUT /teams/:id/members` (批量设置)
- `app/schemas/team.py`
- ⏱️ 1.5h

---

## Phase 3: 需求核心 API

### P3-1 需求 CRUD
- `app/api/requests.py`:
  - `GET /requests` — 列表查询 (含分页/筛选/保密过滤/scope)
  - `GET /requests/:id` — 详情
  - `POST /requests` — 创建
  - `PUT /requests/:id` — 编辑 (admin)
  - `DELETE /requests/:id` — 删除 (admin)
- `app/schemas/request.py`: RequestCreate, RequestUpdate, RequestResponse, RequestListParams
- `app/services/request_service.py`: 从现有 services 平移, 改为 SQLAlchemy 查询
- **重点**: 保密过滤逻辑、scope 参数处理 (mine/feed)
- ⏱️ 3h

### P3-2 需求操作 API
- `POST /requests/:id/accept` — 研究员接受
- `POST /requests/:id/complete` — 研究员完成 (含文件上传)
- `POST /requests/:id/withdraw` — 研究员撤回
- `PUT /requests/:id/reassign` — 管理员重新分配
- `PUT /requests/:id/confidential` — 切换保密
- ⏱️ 2h

### P3-3 文件上传下载 API
- `app/api/files.py`:
  - `POST /files/upload` — 上传 (multipart)
  - `GET /files/download/:request_id` — 下载 (streaming + 记录日志)
- 保持与现有 `data/uploads/` 目录结构兼容
- 下载时自动调 download_service 写日志
- ⏱️ 1.5h

---

## Phase 4: 销售端前端

### P4-1 提交需求页
- `pages/Sales/SubmitRequest/index.tsx`
- ProForm: 字段配置参照 pages.md 2.2
- 机构下拉: 调 `/organizations/by-team` 动态获取
- 部门级联: org_type 变化时联动 department 选项
- 研究员下拉: 调 `/users/researchers`
- 提交: 调 `POST /requests`
- ⏱️ 2h

### P4-2 我的需求页
- `pages/Sales/MyRequests/index.tsx`
- 统计卡片: 调 `/requests?scope=mine` 然后前端聚合, 或新增统计接口
- ProTable: 调 `/requests?scope=mine` + 筛选参数
- RequestDetailDrawer 组件: 点击行展开详情
- FileDownloadButton 组件: 下载 + 日志上报
- ⏱️ 2.5h

### P4-3 需求动态页
- `pages/Sales/RequestFeed/index.tsx`
- ProTable: 调 `/requests?scope=feed` + 多维筛选
- 导出按钮: 调 `/exports/requests`
- ⏱️ 1.5h

### P4-4 通用组件抽取
- `components/RequestDetailDrawer/index.tsx`
- `components/StatsCards/index.tsx`
- `components/FileDownloadButton/index.tsx`
- 这些组件在研究端/管理端复用
- ⏱️ 1.5h

---

## Phase 5: 研究端前端

### P5-1 研究员提交需求
- `pages/Researcher/SubmitRequest/index.tsx`
- 复用销售提交表单, 额外加 sales_id 下拉
- 机构列表: 根据所选销售的 team_id 动态获取 → 需一个 `/organizations?team_id=X` 接口
- ⏱️ 1.5h

### P5-2 我的任务页
- `pages/Researcher/MyTasks/index.tsx`
- Tabs 组件 (4 个 Tab):
  - 待处理: 列表 + 接受/撤回按钮
  - 处理中: 列表 + 完成操作 (Modal: 上传附件 + 填说明 + 工时)
  - 已完成: 只读列表
  - 我提交的: 只读列表 (created_by = me)
- ⏱️ 3h

### P5-3 需求动态 (复用)
- 直接复用 Sales/RequestFeed 组件, 或提取为公共页
- ⏱️ 0.5h

---

## Phase 6: 管理端统计 API

### P6-1 总览与排行 API
- `app/api/stats.py`:
  - `GET /stats/overview` — 卡片数据
  - `GET /stats/researcher-ranking` — 排行
- `app/services/stats_service.py`: 从现有 stats_service 平移核心 SQL
- ⏱️ 2h

### P6-2 多维矩阵 API
- `GET /stats/researcher-matrix`
- `GET /stats/type-matrix`
- `GET /stats/org-matrix`
- `GET /stats/sales-matrix`
- `GET /stats/charts` (饼图+柱状图数据)
- 复用现有多时间维度 SQL, 返回 JSON 格式
- ⏱️ 2h

### P6-3 下载统计 API
- `GET /stats/downloads`
- `app/services/download_service.py`: 从现有 download_service 平移
- ⏱️ 1h

### P6-4 导出 API
- `app/api/exports.py`:
  - `GET /exports/requests` → StreamingResponse (Excel)
  - `GET /exports/requests/preview` → JSON
- `app/utils/export.py`: 用 openpyxl 生成 Excel
- ⏱️ 1.5h

---

## Phase 7: 管理端前端

### P7-1 工作量看板
- `pages/Admin/Dashboard/index.tsx`
- PeriodSelector 组件 (时间周期切换)
- StatsCards (5 个指标)
- 研究员排行 ProTable (可展开明细)
- ⏱️ 2h

### P7-2 多维分析 — 统计看板 Tab
- `pages/Admin/Analytics/index.tsx`
- Tab1: 饼图 ×2 + 柱状图 ×1 (用 @ant-design/charts)
- ⏱️ 1.5h

### P7-3 多维分析 — 矩阵表格 Tabs
- Tab2-5: MultiDimensionTable 组件 (行=维度, 列=时间)
- 自动过滤全 0 行, 底部固定总计行
- 4 个 Tab 复用同一组件, 传不同 API 和维度名
- ⏱️ 2h

### P7-4 多维分析 — 下载统计 Tab
- Tab6: Top10 排行表 + 近期记录表
- ⏱️ 1h

### P7-5 数据导出页
- `pages/Admin/Export/index.tsx`
- ProForm 筛选区 + ProTable 预览 + 导出按钮
- ⏱️ 1.5h

### P7-6 系统管理 — 用户管理
- `pages/Admin/Settings/Users/index.tsx`
- ProTable + Modal CRUD
- 角色 Tag 颜色区分
- 密码重置 Popconfirm
- ⏱️ 2h

### P7-7 系统管理 — 需求管理
- `pages/Admin/Settings/Requests/index.tsx`
- ProTable (全字段筛选) + Drawer 编辑表单
- 重新分配/切换保密/删除操作
- ⏱️ 2h

### P7-8 系统管理 — 机构管理
- `pages/Admin/Settings/Orgs/index.tsx`
- ProTable + Modal CRUD
- ⏱️ 1h

### P7-9 系统管理 — 团队配置
- `pages/Admin/Settings/Teams/index.tsx`
- ProTable + Modal CRUD
- 机构分配: Transfer 组件 (左右穿梭)
- 成员分配: Transfer 组件
- ⏱️ 2h

---

## Phase 8: 联调与收尾

### P8-1 密码迁移脚本
- `scripts/migrate_passwords.py`
- 批量将 password_version=1 的用户标记 (实际迁移在首次登录时完成)
- ALTER TABLE 添加 password_version 字段
- ⏱️ 0.5h

### P8-2 性能索引
- 执行 database.md 中的建议索引 SQL
- ⏱️ 0.5h

### P8-3 Nginx 部署配置
- 前端 build → Nginx 托管
- `/api/*` 反向代理到 Uvicorn
- 编写 `deploy/nginx.conf`
- 编写 `deploy/nssm-setup.bat` (后端 Windows 服务)
- ⏱️ 1h

### P8-4 全量功能走查
- 按 proposal.md 功能矩阵逐项验证
- 三角色登录流程测试
- 保密需求可见性测试
- 文件上传下载完整链路
- 统计数据准确性比对 (与现有系统)
- ⏱️ 2h

---

## 任务依赖图

```
P0 (初始化)
  ├→ P1 (认证)
  │    └→ P4 (销售前端)
  │    └→ P5 (研究前端)
  │    └→ P7 (管理前端)
  ├→ P2 (基础数据 API)
  │    └→ P4, P5, P7
  └→ P3 (需求 API)
       └→ P4, P5
       └→ P6 (统计 API)
            └→ P7
                 └→ P8 (联调收尾)
```

---

## 工期汇总

| 阶段 | 任务数 | 预估工时 |
|------|--------|---------|
| P0 初始化 | 4 | 2.5h |
| P1 认证 | 5 | 6h |
| P2 基础数据 | 3 | 4.5h |
| P3 需求核心 | 3 | 6.5h |
| P4 销售前端 | 4 | 7.5h |
| P5 研究前端 | 3 | 5h |
| P6 统计 API | 4 | 6.5h |
| P7 管理前端 | 9 | 15h |
| P8 联调收尾 | 4 | 4h |
| **合计** | **39 个原子任务** | **~58h ≈ 7-8 个工作日** |

> 以上为纯编码时间, 实际含调试/沟通/需求确认, 建议预留 2x 缓冲 → **3-4 周**
