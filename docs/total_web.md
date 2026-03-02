按照任务依赖关系，我建议分 **5 轮** 给 Gemini。每轮 prompt 我直接帮你写好：

---

## 第 1 轮：项目初始化 + 登录 + 权限路由（P0-4, P1-4, P1-5）

```markdown
# 角色
你是前端架构师，负责用 React + Ant Design Pro v6 构建一个内部需求管理系统的前端。

# 项目背景
这是一个从 Streamlit 单体应用重构为前后端分离的项目。后端已由 FastAPI 实现完毕，你只负责前端。

# 技术约定

## 前端技术栈
| 层 | 选型 | 说明 |
|------|------|------|
| 框架 | React 18 | — |
| 脚手架 | Ant Design Pro | 使用初始化时最新稳定版, 内置权限路由、ProTable、ProForm |
| UI 库 | Ant Design 5.x | — |
| 图表 | @ant-design/charts (基于 G2) | 替代 Plotly |
| 状态管理 | zustand 或 Ant Design Pro 内置 | 轻量优先 |
| 请求层 | umi-request / axios | 统一拦截器处理 JWT 刷新 |
| 构建 | Umi 4 | Ant Design Pro 默认 |
| 国际化 | 暂不需要 | 纯中文系统 |

## 编码规范
- ESLint + Prettier (Ant Design Pro 默认配置)
- 组件: 函数式 + Hooks, 禁止 class 组件
- 命名: PascalCase 组件, camelCase 函数/变量
- API 返回类型: 必须定义 TypeScript interface
- 状态: 页面级用 useState, 跨页面用 zustand store
- ProTable/ProForm: 优先使用 Ant Design Pro 高级组件

## API 通用响应格式
所有后端 API 返回格式统一为：
```json
// 成功
{ "code": 0, "data": { ... }, "message": "ok" }

// 分页
{ "code": 0, "data": { "items": [...], "total": 100 }, "message": "ok" }

// 错误
{ "code": 40001, "data": null, "message": "用户名或密码错误" }
```

认证方式: JWT Bearer Token
- Header: `Authorization: Bearer <token>`
- access_token 有效期 24h, refresh_token 7d

## 后端认证 API (Base URL: /api/v1)

### POST /auth/login
```
Request:  { "username": "str", "password": "str" }
Response: { "access_token": "str", "refresh_token": "str", "user": { "id": int, "username": "str", "role": "str", "display_name": "str", "team_id": int|null } }
```

### POST /auth/refresh
```
Request:  { "refresh_token": "str" }
Response: { "access_token": "str" }
```

### PUT /auth/password
```
Request:  { "old_password": "str", "new_password": "str" }
Response: { "message": "ok" }
```

# 当前任务

## 任务 1: 项目初始化 (P0-4)
- 使用 Ant Design Pro v6 初始化项目到 `web/` 目录
- 清理默认页面和示例代码
- 配置代理: `config/proxy.ts` → `/api` 转发 `localhost:8000`
- 配置中文: `config/config.ts` locale 设为 zh-CN

## 任务 2: 登录页 + Token 管理 (P1-4)
- `pages/Login/index.tsx`: ProForm 登录表单 (username + password)
- `services/auth.ts`: login(), refresh(), changePassword() 封装
- Token 存 localStorage (access_token + refresh_token)
- 请求拦截器:
  - 自动注入 Authorization header
  - 401 时跳转登录页
  - 响应拦截器统一解包 data 层 (从 {code, data, message} 中提取 data)
- `app.tsx`: getInitialState() 从 localStorage 读取用户信息, 未登录跳转 /login

## 任务 3: 权限路由 (P1-5)
- `access.ts`: 根据 user.role 控制菜单可见性
  ```typescript
  export default {
    '/sales':      ['sales'],
    '/researcher': ['researcher'],
    '/admin':      ['admin'],
  }
  ```
- `config/routes.ts`: 完整路由配置如下:
  ```typescript
  export default [
    { path: '/login', component: './Login', layout: false },
    // 销售端
    {
      path: '/sales',
      name: '销售端',
      icon: 'ShoppingOutlined',
      access: 'sales',
      routes: [
        { path: '/sales/submit',  name: '提交需求',  component: './Sales/SubmitRequest' },
        { path: '/sales/mine',    name: '我的需求',  component: './Sales/MyRequests' },
        { path: '/sales/feed',    name: '需求动态',  component: './Sales/RequestFeed' },
      ],
    },
    // 研究端
    {
      path: '/researcher',
      name: '研究端',
      icon: 'ExperimentOutlined',
      access: 'researcher',
      routes: [
        { path: '/researcher/submit', name: '提交需求',  component: './Researcher/SubmitRequest' },
        { path: '/researcher/tasks',  name: '我的任务',  component: './Researcher/MyTasks' },
        { path: '/researcher/feed',   name: '需求动态',  component: './Researcher/RequestFeed' },
      ],
    },
    // 管理端
    {
      path: '/admin',
      name: '管理端',
      icon: 'DashboardOutlined',
      access: 'admin',
      routes: [
        { path: '/admin/dashboard',  name: '工作量看板', component: './Admin/Dashboard' },
        { path: '/admin/analytics',  name: '多维分析',   component: './Admin/Analytics' },
        { path: '/admin/export',     name: '数据导出',   component: './Admin/Export' },
        {
          path: '/admin/settings',
          name: '系统管理',
          routes: [
            { path: '/admin/settings/users',    name: '用户管理', component: './Admin/Settings/Users' },
            { path: '/admin/settings/requests', name: '需求管理', component: './Admin/Settings/Requests' },
            { path: '/admin/settings/orgs',     name: '机构管理', component: './Admin/Settings/Orgs' },
            { path: '/admin/settings/teams',    name: '团队配置', component: './Admin/Settings/Teams' },
          ],
        },
      ],
    },
  ];
  ```
- 各路由对应的页面文件先创建空白占位组件 (显示页面名称即可)
- 登录后根据角色自动跳转到对应端首页: sales→/sales/mine, researcher→/researcher/tasks, admin→/admin/dashboard

# 验证标准
- npm run dev 启动成功
- 访问 /login 显示登录表单
- 使用 admin/123456 登录后跳转到 /admin/dashboard
- 使用 sales1/123456 登录后跳转到 /sales/mine, 且看不到研究端和管理端菜单
- 使用 researcher1/123456 登录后跳转到 /researcher/tasks
```

---

## 第 2 轮：销售端前端（P4-1 ~ P4-4）

```markdown
# 角色
你是前端开发者，继续上一轮的项目，现在开发销售端的 3 个页面 + 通用组件。

# 已完成
- 项目初始化、登录、权限路由已完成
- 所有页面目前是空白占位组件

# 后端 API

## GET /api/v1/organizations/by-team
当前用户所属团队的机构列表 (可传 team_id 参数)
```
参数: team_id? (int, 可选)
Response: [{ "id": int, "name": "str", "org_type": "str" }]
```

## GET /api/v1/users/researchers
```
Response: [{ "id": int, "username": "str", "display_name": "str" }]
```

## POST /api/v1/requests
```
Request: {
  "title": "str",           // 必填
  "description": "str?",
  "request_type": "str",    // 必填, 枚举: 基金筛选|传统报告定制|量化策略定制|系统定制|综合暂时兜底
  "research_scope": "str?", // 枚举: 纯债|固收+|权益|量化|资产配置|其他
  "org_name": "str",        // 必填, 从机构列表选择
  "org_type": "str?",       // 选择机构后自动带入
  "department": "str?",     // 银行→[金市,资管,其他], 券商→[自营,资管,其他], 保险→[母公司,资管,其他], 其他类型不显示
  "researcher_id": int,     // 必填
  "is_confidential": bool?, // 默认 false
  "created_at": "datetime?" // 默认当前时间, 支持回溯
}
Response: { "id": int }
```

## GET /api/v1/requests
```
参数: status?, request_type?, research_scope?, org_type?, researcher_id?, sales_id?,
      keyword?, date_from?, date_to?, scope? (mine|feed), page?, page_size?
Response: { "items": [RequestItem], "total": int }
其中 RequestItem = {
  id, title, description, request_type, research_scope, org_name, org_type,
  department, sales_id, researcher_id, is_confidential, status, result_note,
  attachment_path, work_hours, created_by, created_at, updated_at, completed_at,
  sales_name, researcher_name, download_count
}
```

## GET /api/v1/files/download/:request_id
直接返回文件流, 用于下载附件

## GET /api/v1/exports/requests
返回 Excel 文件流, 参数同 GET /requests 的筛选参数

# 业务规则

## 部门级联
```
org_type 变化时:
  if org_type in ["银行", "券商", "保险"]:
    显示 department 下拉, 选项:
    银行 → [金市, 资管, 其他]
    券商 → [自营, 资管, 其他]
    保险 → [母公司, 资管, 其他]
  else:
    隐藏 department, 值设为 null
```

## 需求状态显示
- pending → 待处理 (橙色)
- in_progress → 处理中 (蓝色)
- completed → 已完成 (绿色)

# 当前任务

## 任务 1: 提交需求页 (P4-1)
`pages/Sales/SubmitRequest/index.tsx`
- ProForm 表单, 字段:
  | 字段 | 组件 | 说明 |
  |------|------|------|
  | title | Input | 必填 |
  | description | TextArea | 选填 |
  | request_type | Select | 枚举, 必填 |
  | research_scope | Select | 枚举, 选填 |
  | org_name | Select | 从 /organizations/by-team 获取, 必填 |
  | org_type | 自动填入 | 选择机构后带入, 只读显示 |
  | department | Select | 级联: 银行/券商/保险时才显示 |
  | researcher_id | Select | 从 /users/researchers 获取, 必填 |
  | is_confidential | Switch | 默认关 |
  | created_at | DatePicker | 默认当前, 支持回溯 |
- 提交成功后提示并重置表单

## 任务 2: 我的需求页 (P4-2)
`pages/Sales/MyRequests/index.tsx`
- 顶部: 4 个统计卡片 (总数/待处理/处理中/已完成), 数据从 scope=mine 的列表前端聚合
- ProTable: 调 /requests?scope=mine
  - 筛选器: status, org_type, date_range, keyword
  - 列: 标题, 机构, 需求类型, 研究员, 状态(Tag 带颜色), 创建时间, 操作
  - 操作: 查看详情 → Drawer; 下载附件 → 仅 completed 且有 attachment_path 时可用
- 使用通用组件 RequestDetailDrawer

## 任务 3: 需求动态页 (P4-3)
`pages/Sales/RequestFeed/index.tsx`
- ProTable: 调 /requests?scope=feed
- 筛选器: request_type, research_scope, org_type, date_range
- 下载附件按钮
- 导出 Excel 按钮 (调 /exports/requests 下载)

## 任务 4: 通用组件 (P4-4)
- `components/RequestDetailDrawer/index.tsx` — 需求详情抽屉, 展示所有字段
- `components/StatsCards/index.tsx` — 统计卡片行, 接收 items 数组自动聚合
- `components/FileDownloadButton/index.tsx` — 下载按钮, 调 /files/download/:id

# 验证标准
- sales1 登录后可正常提交需求 (选机构后 org_type 自动填入, 选银行时出现部门下拉)
- 我的需求页显示统计卡片和表格, 点击行可查看详情
- 需求动态页显示已完成的公开需求
```

---

## 第 3 轮：研究端前端（P5-1 ~ P5-3）

```markdown
# 角色
继续开发，现在做研究端的 3 个页面。

# 已完成
- 登录/权限/销售端/通用组件 已全部完成

# 额外 API

## GET /api/v1/users/sales
```
Response: [{ "id": int, "display_name": "str", "team_id": int }]
```

## POST /api/v1/requests/:id/accept
研究员接受任务: pending → in_progress
```
权限: researcher (且为该需求的 researcher_id)
Response: { "message": "ok" }
```

## POST /api/v1/requests/:id/complete
研究员完成任务 (multipart/form-data):
```
字段: result_note (str?), work_hours (float?), attachment (File?)
Response: { "message": "ok" }
```

## POST /api/v1/requests/:id/withdraw
研究员撤回 (仅 pending 状态):
```
Response: { "message": "ok" }
```

# 当前任务

## 任务 1: 研究员提交需求 (P5-1)
`pages/Researcher/SubmitRequest/index.tsx`
- 复用销售提交表单逻辑, 额外增加:
  - sales_id Select (从 /users/sales 获取, 必填)
  - 选择销售后, 机构列表根据该销售的 team_id 动态获取: /organizations/by-team?team_id=X

## 任务 2: 我的任务页 (P5-2)
`pages/Researcher/MyTasks/index.tsx`
- Tabs 组件 (4 个 Tab):
  - **待处理** (scope=mine, status=pending, researcher_id=me): 列表 + 「接受」/「撤回」按钮
  - **处理中** (scope=mine, status=in_progress): 列表 + 「完成」按钮
    - 完成操作弹 Modal: 上传附件 + 填写说明 + 填工时(小时,1位小数)
    - 表单提交用 multipart/form-data
  - **已完成** (scope=mine, status=completed): 只读列表, 可下载附件
  - **我提交的** (created_by=me): 只读列表, 同 MyRequests 结构
- 复用 RequestDetailDrawer 和 FileDownloadButton

## 任务 3: 需求动态 (P5-3)
`pages/Researcher/RequestFeed/index.tsx`
- 直接复用 Sales/RequestFeed 组件, 或提取为公共页

# 验证标准
- researcher1 登录后可代提需求 (选销售后机构列表动态变化)
- 待处理 Tab 可接受/撤回任务
- 处理中 Tab 可上传附件完成任务
- 需求动态复用正常
```

---

## 第 4 轮：管理端 — 工作量看板 + 多维分析 + 数据导出（P7-1 ~ P7-5）

```markdown
# 角色
继续开发，现在做管理端的统计分析页面。

# 已完成
- 登录/权限/销售端/研究端 全部完成

# 后端统计 API (全部 admin only)

## GET /api/v1/stats/overview
```
参数: period (today|week|month|quarter|year)
Response: { "total": int, "pending": int, "in_progress": int, "completed": int, "total_hours": float }
```

## GET /api/v1/stats/researcher-ranking
```
参数: period
Response: [{ "user_id": int, "display_name": "str", "completed_count": int, "work_hours": float, "pending_count": int, "in_progress_count": int }]
```

## GET /api/v1/stats/researcher-matrix
```
Response: [{ "name": "str", "today": int, "week": int, "month": int, "quarter": int, "year": int }]
```

## GET /api/v1/stats/type-matrix
同上格式, 行=需求类型

## GET /api/v1/stats/org-matrix
```
Response: [{ "name": "str", "count": int, "hours": float }]
```

## GET /api/v1/stats/sales-matrix
同 researcher-matrix 格式, 行=销售

## GET /api/v1/stats/charts
```
参数: period
Response: {
  "type_distribution": [{ "name": "str", "value": int }],
  "org_type_distribution": [{ "name": "str", "value": int }],
  "researcher_workload": [{ "name": "str", "completed": int, "in_progress": int, "pending": int }]
}
```

## GET /api/v1/stats/downloads
```
Response: {
  "top_downloads": [{ "request_id": int, "title": "str", "total_count": int, "unique_users": int }],
  "recent_logs": [{ "request_title": "str", "user_name": "str", "org_name": "str", "downloaded_at": "str" }]
}
```

## GET /api/v1/exports/requests/preview
```
参数: 同 GET /requests 筛选参数
Response: { "items": [RequestItem], "total": int }
```

## GET /api/v1/exports/requests
返回 Excel 文件流

# 当前任务

## 任务 1: 工作量看板 (P7-1)
`pages/Admin/Dashboard/index.tsx`
- 顶部: PeriodSelector 组件 (今日/本周/本月/当季/今年 切换)
- 5 个 StatisticCard (总数/待处理/处理中/已完成/总工时)
- 研究员工作量排行 ProTable (排名/姓名/已完成/处理中/待处理/总工时)
  - 可展开行查看该研究员的需求明细 (调 /requests?researcher_id=X)

## 任务 2: 多维分析 — 统计看板 Tab (P7-2)
`pages/Admin/Analytics/index.tsx`
- Tab1 统计看板: 饼图×2 (需求类型分布, 客户类型分布) + 柱状图×1 (研究员工作量)
- 使用 @ant-design/charts

## 任务 3: 多维分析 — 矩阵表格 Tabs (P7-3)
- Tab2 研究员视角: ProTable (行=研究员, 列=今日/本周/本月/当季/今年)
- Tab3 需求类型视角: 同上结构
- Tab4 客户视角: ProTable (行=机构, 列=需求数/工时)
- Tab5 销售视角: 同 Tab2 结构
- 抽取通用 MultiDimensionTable 组件, 4个 Tab 复用, 传不同 API 和维度名
- 自动过滤全 0 行, 底部固定总计行

## 任务 4: 多维分析 — 下载统计 Tab (P7-4)
- Tab6: Top10 下载排行表格 + 近期下载记录表格 (最近50条)

## 任务 5: 数据导出页 (P7-5)
`pages/Admin/Export/index.tsx`
- ProForm 筛选区: date_range, request_type, research_scope, sales_id, researcher_id, org_name, org_type, status
- ProTable 预览前 20 条 (调 /exports/requests/preview)
- "导出 Excel" 按钮 (调 /exports/requests 下载)

# 通用组件
- `components/PeriodSelector/index.tsx` — 时间周期选择器 (今日/本周/本月/当季/今年)
- `components/MultiDimensionTable/index.tsx` — 多时间维度统计表格

# 验证标准
- admin 登录后看到工作量看板, 切换时间维度数据更新
- 多维分析 6 个 Tab 均正常显示
- 数据导出可预览和下载 Excel
```

---

## 第 5 轮：管理端 — 系统管理（P7-6 ~ P7-9）

```markdown
# 角色
继续开发，最后一批: 管理端系统管理的 4 个 CRUD 页面。

# 已完成
- 所有其他页面已完成

# 后端 API

## 用户管理
- GET /api/v1/users — 用户列表 (参数: role?)
- POST /api/v1/users — 创建: { username, password, role, display_name, team_id? }
- PUT /api/v1/users/:id — 编辑: { display_name?, role?, team_id? }
- DELETE /api/v1/users/:id
- PUT /api/v1/users/:id/reset-password — { new_password: str }

## 需求管理
- GET /api/v1/requests — 全字段筛选
- PUT /api/v1/requests/:id — 编辑所有字段 (admin)
- DELETE /api/v1/requests/:id
- PUT /api/v1/requests/:id/reassign — { researcher_id: int }
- PUT /api/v1/requests/:id/confidential — { is_confidential: bool }

## 机构管理
- GET /api/v1/organizations
- POST /api/v1/organizations — { name, org_type? }
- PUT /api/v1/organizations/:id — { name?, org_type? }
- DELETE /api/v1/organizations/:id

## 团队管理
- GET /api/v1/teams — 返回含 org_count, member_count
- POST /api/v1/teams — { name }
- DELETE /api/v1/teams/:id
- GET /api/v1/teams/:id/organizations
- PUT /api/v1/teams/:id/organizations — { org_ids: [int] } 全量替换
- PUT /api/v1/teams/:id/members — { user_ids: [int] } 全量替换

# 当前任务

## 任务 1: 用户管理 (P7-6)
`pages/Admin/Settings/Users/index.tsx`
- ProTable (username, display_name, role Tag颜色区分, team, created_at)
- 新建: Modal + ProForm (username, password, role Select, display_name, team_id Select)
- 编辑: Modal
- 重置密码: Popconfirm + 输入新密码
- 删除: Popconfirm
- 角色 Tag 颜色: sales=蓝, researcher=绿, admin=红

## 任务 2: 需求管理 (P7-7)
`pages/Admin/Settings/Requests/index.tsx`
- ProTable (全字段, 多条件筛选)
- 编辑: Drawer + ProForm (所有字段可改)
- 重新分配: 改 researcher_id (Select 选研究员)
- 切换保密: Switch
- 删除: Popconfirm

## 任务 3: 机构管理 (P7-8)
`pages/Admin/Settings/Orgs/index.tsx`
- ProTable (name, org_type, created_at)
- 新建/编辑: Modal + ProForm
- 删除: Popconfirm

## 任务 4: 团队配置 (P7-9)
`pages/Admin/Settings/Teams/index.tsx`
- ProTable (name, 机构数, 成员数, created_at)
- 新建团队: Modal
- 管理机构: Modal + Transfer 组件 (左=全部机构, 右=已分配)
  - 保存调 PUT /teams/:id/organizations
- 管理成员: Modal + Transfer 组件 (左=全部销售, 右=已分配)
  - 保存调 PUT /teams/:id/members
- 删除团队: Popconfirm

# 验证标准
- 用户 CRUD 正常, 角色 Tag 颜色正确
- 需求管理可编辑任意字段、重新分配、切换保密
- 机构 CRUD 正常
- 团队配置的 Transfer 穿梭框可正确分配机构和成员
```

---

按这 5 轮顺序给 Gemini，每轮完成并验证通过后再给下一轮。