> ✅ Phase 0~8 已全部完成, 当前处于部署与优化阶段。

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
- `models/request.py`: Request (含新增 withdraw_reason 字段)
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

### P0-5 数据库迁移脚本
- `scripts/migrate_v3.py`: 新增 withdraw_reason 字段 + password_version 字段
- 幂等执行 (检查列是否存在再 ALTER)
- 验证: 对现有 data.db 执行迁移成功
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
- 请求拦截器: Authorization header 注入, 401 跳转登录
- `app.tsx`: getInitialState() 获取用户信息
- ⏱️ 2h

### P1-5 前端权限路由
- `access.ts`: 三角色权限控制
- 完整路由配置 (参照 pages.md §1)
- 占位页面: 13 个页面的空壳
- 验证: 不同角色登录看到不同菜单
- ⏱️ 1h

---

## Phase 2: 核心 CRUD API

### P2-1 用户管理 API
- `app/api/users.py`:
  - `GET /users` (admin)
  - `GET /users/researchers` → 返回 role IN ('researcher', 'admin')
  - `GET /users/sales` → 返回 role IN ('sales', 'admin')
  - `POST /users`, `PUT /users/:id`, `DELETE /users/:id` (admin)
  - `PUT /users/:id/reset-password` (admin)
- ⏱️ 1.5h

### P2-2 机构/团队 API
- `app/api/organizations.py`:
  - `GET /organizations` (admin), `GET /organizations/by-team` (all)
  - admin 被选为销售时 by-team 返回全部
  - CRUD (admin)
- `app/api/teams.py`:
  - `GET /teams`, `POST /teams`, `DELETE /teams/:id`
  - `GET /teams/:id/organizations`, `PUT /teams/:id/organizations`
  - `PUT /teams/:id/members`
- ⏱️ 2h

### P2-3 需求管理 API
- `app/api/requests.py`:
  - `GET /requests` (含 scope=mine/feed + 角色可见性过滤 + 保密过滤)
  - `GET /requests/:id`
  - `POST /requests`
  - `PUT /requests/:id` (admin 全字段 + sales 限定字段/状态)
  - `DELETE /requests/:id` (admin)
- `app/services/request_service.py`:
  - scope=feed 时字段过滤 (org_name, department, work_hours, sales_name, is_confidential 置 null)
  - scope=mine 时: researcher 排除 withdrawn/canceled
- ⏱️ 3h

### P2-4 需求操作 API
- `POST /requests/:id/accept` — 研究员接受
- `POST /requests/:id/complete` — 研究员完成 (multipart)
- `POST /requests/:id/withdraw` — 研究员退回, body: `{ "reason": "str" }`
  - 动作: status → withdrawn, 写入 withdraw_reason, 保留 researcher_id
- `POST /requests/:id/resubmit` — 销售重新提交, body: 可编辑字段 + researcher_id
  - 动作: 更新字段, status → pending, withdraw_reason → null
- `POST /requests/:id/cancel` — 销售取消, pending/withdrawn → canceled
- `PUT /requests/:id/reassign` (admin)
- `PUT /requests/:id/confidential` (admin)
- ⏱️ 2h

---

## Phase 3: 文件与导出 API

### P3-1 文件上传/下载
- `app/api/files.py`:
  - `GET /files/download/:request_id` — 下载 + 写日志
    - 参数 `org_name` (销售必传, 研究员/admin 不传, 记录为 null)
  - `POST /files/upload` (备用)
- 文件存储路径: `uploads/{request_id}/filename`
- 下载时自动调 download_service 写日志
- ⏱️ 1.5h

### P3-2 导出 API
- `app/api/exports.py`:
  - `GET /exports/requests` → StreamingResponse (Excel)
    - admin: 全字段导出
    - sales/researcher: 仅 feed 公开数据 + 展示字段
  - `GET /exports/requests/preview` (admin only)
- `app/utils/export.py`: openpyxl 生成 Excel
- ⏱️ 1.5h

---

## Phase 4: 销售端前端

### P4-1 提交需求页
- `pages/Sales/SubmitRequest/index.tsx`
- ProForm: 字段配置参照 pages.md §2.2
- 机构下拉: 调 `/organizations/by-team` 动态获取
- 部门级联: org_type 变化时联动 department 选项
- 研究员下拉: 调 `/users/researchers` (含 admin)
- 提交: 调 `POST /requests`
- ⏱️ 2h

### P4-2 我的需求页
- `pages/Sales/MyRequests/index.tsx`
- 统计卡片: 总数/待处理/处理中/已完成/已退回
- ProTable: 调 `/requests?scope=mine` + 筛选参数
- 5 种状态的 Tag 颜色展示
- 操作按钮: 查看详情、编辑 (pending/withdrawn)、重新提交 (withdrawn)、取消 (pending/withdrawn)、下载 (completed)
- withdrawn 状态详情展示退回原因
- ⏱️ 3h

### P4-3 需求动态页
- `pages/Sales/RequestFeed/index.tsx`
- ProTable: 调 `/requests?scope=feed` + 多维筛选
- 表格列: 隐藏 org_name, department, work_hours, sales_name
- 下载按钮: 弹窗选机构后下载
- 导出 Excel 按钮 (调 `/exports/requests`, 仅展示字段)
- ⏱️ 2h

### P4-4 通用组件抽取
- `components/RequestDetailDrawer/index.tsx` — 需求详情抽屉, mode 参数控制字段展示
- `components/StatsCards/index.tsx` — 统计卡片行
- `components/FileDownloadButton/index.tsx` — 下载按钮 (含日志上报)
- `components/OrgSelectModal/index.tsx` — 销售下载时选机构弹窗
- ⏱️ 2h

---

## Phase 5: 研究端前端

### P5-1 研究员提交需求
- `pages/Researcher/SubmitRequest/index.tsx`
- 复用销售提交表单, 额外加 sales_id 下拉 (含 admin)
- 机构列表: 根据所选销售的 team_id 动态获取; admin 被选时显示全部
- ⏱️ 1.5h

### P5-2 我的任务页
- `pages/Researcher/MyTasks/index.tsx`
- Tabs 组件 (4 个 Tab):
  - 待处理: 列表 + 接受/退回按钮
  - 退回操作: Modal 弹窗填写退回原因 (TextArea 必填)
  - 处理中: 列表 + 完成操作 (Modal: 上传附件 + 填说明 + 工时)
  - 已完成: 只读列表
  - 我提交的: 只读列表
- withdrawn 需求不显示在任何 Tab
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
- ⏱️ 2h

### P6-2 多维矩阵 API
- `GET /stats/researcher-matrix`
- `GET /stats/type-matrix`
- `GET /stats/org-matrix`
- `GET /stats/sales-matrix`
- `GET /stats/charts` (饼图+柱状图数据)
- ⏱️ 2h

### P6-3 下载统计 API
- `GET /stats/downloads`
- ⏱️ 1h

---

## Phase 7: 管理端前端

### P7-1 工作量看板
- `pages/Admin/Dashboard/index.tsx`
- PeriodSelector + StatisticCard × 5 + 研究员排行表格
- ⏱️ 2.5h

### P7-2 多维分析 — 统计看板 Tab
- `pages/Admin/Analytics/index.tsx` (Tab 1)
- 饼图 × 2 + 柱状图 × 1 (用 @ant-design/charts)
- ⏱️ 2h

### P7-3 多维分析 — 矩阵 Tabs
- Tab 2~5: 研究员/需求类型/客户/销售 矩阵表格
- MultiDimensionTable 组件复用
- ⏱️ 2h

### P7-4 多维分析 — 下载统计 Tab
- Tab 6: Top 10 + 近期记录
- ⏱️ 1h

### P7-5 数据导出页
- `pages/Admin/Export/index.tsx`
- 筛选 + 预览 + 全字段 Excel 导出
- ⏱️ 1.5h

### P7-6 用户管理
- `pages/Admin/Settings/Users/index.tsx`
- ProTable + CRUD Modal
- ⏱️ 1.5h

### P7-7 需求管理
- `pages/Admin/Settings/Requests/index.tsx`
- ProTable + 编辑 Drawer + 重新分配 + 切换保密 + 删除
- ⏱️ 2h

### P7-8 机构管理
- `pages/Admin/Settings/Orgs/index.tsx`
- ProTable + CRUD Modal
- ⏱️ 1h

### P7-9 团队配置
- `pages/Admin/Settings/Teams/index.tsx`
- ProTable + Transfer 穿梭框 (机构+成员)
- ⏱️ 2h

---

## Phase 8: 联调收尾

### P8-1 前后端联调
- 全流程走通: 提交 → 接受 → 完成 → 动态可见
- 退回流程: 退回 → 销售看到退回原因 → 修改重提/取消
- 保密需求可见性验证
- 下载日志验证 (销售选机构)
- ⏱️ 2h

### P8-2 样式打磨
- 状态 Tag 颜色统一
- 移动端基本适配
- 空状态/Loading 状态
- ⏱️ 1.5h

### P8-3 部署脚本
- Nginx 配置 (静态资源 + API 反向代理)
- Uvicorn + NSSM (Windows Server)
- 数据库备份定时任务
- ⏱️ 1h

---

## 总计工时估算

| 阶段 | 工时 |
|------|------|
| Phase 0: 初始化 | 2.5h |
| Phase 1: 认证 | 6h |
| Phase 2: 核心 CRUD | 8.5h |
| Phase 3: 文件与导出 | 3h |
| Phase 4: 销售端前端 | 9h |
| Phase 5: 研究端前端 | 5h |
| Phase 6: 统计 API | 5h |
| Phase 7: 管理端前端 | 15.5h |
| Phase 8: 收尾 | 4.5h |
| **合计** | **~59h** |

# 验收流程

### Step 1：后端启动 + 数据兼容性

- [ ] 用真实 `data.db` 启动后端，确认无报错
- [ ] 跑 `migrate_v3.py`（如果还没跑过），确认字段迁移成功
- [ ] 访问 `/docs` Swagger 页面正常
- [ ] 用一个已有账号调 `/api/v1/auth/login`，确认 SHA256→bcrypt 密码迁移正常（首次登录后密码自动升级）

### Step 2：登录 + 权限路由

- [ ] 分别用 sales / researcher / admin 账号登录前端
- [ ] 确认各角色只能看到自己的菜单
- [ ] Token 过期后自动跳回登录页

### Step 3：销售端全流程

- [ ] **提交需求**：选择机构、填写内容、提交成功
- [ ] **我的需求**：列表显示正确，统计卡片数字正确（总数/各状态数与实际一致）
- [ ] **需求详情**：点开 Drawer，字段完整、文件可下载
- [ ] **撤回需求**：pending 状态的需求可撤回（变 canceled）
- [ ] **修改重提**：withdrawn 状态的需求可编辑后重新提交（变回 pending）
- [ ] **需求动态 Feed**：看到所有 completed 需求，确认**脱敏**（无机构名、无销售名、无工时、无下载次数）
- [ ] **Feed 下载文件**：下载正常，下载计数递增
- [ ] **Feed 导出 Excel**：导出的列是脱敏的 FEED_COLUMNS

### Step 4：研究员端全流程

- [ ] **提交需求**：researcher_id 默认当前用户，可修改
- [ ] **我的任务 - 待处理**：能看到 pending 需求，可接受/退回
- [ ] **接受需求**：状态变 in_progress
- [ ] **退回需求**：弹窗填原因，状态变 withdrawn
- [ ] **完成需求**：上传文件 + 填工时，状态变 completed
- [ ] **我的任务 - 进行中**：显示已接受的需求
- [ ] **需求动态 Feed**：研究员看到完整信息（含机构名、工时等）

### Step 5：管理端（如已实现）

- [ ] Dashboard 看板数据正确
- [ ] 用户/机构/团队 CRUD
- [ ] 需求管理（全局视图）
- [ ] 数据导出（完整列）

### Step 6：边界情况 + 真实数据量验证

- [ ] **大数据量翻页**：真实数据有多少条需求？翻页是否流畅
- [ ] **中文文件名**：上传/下载含中文名的文件
- [ ] **特殊字符**：需求标题含引号、括号等
- [ ] **并发接受**：两个研究员同时接受同一个 pending 需求（应只有一人成功）
- [ ] **已删除用户的历史需求**：是否还能正常显示（不报错）

