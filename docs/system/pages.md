# pages.md — 前端页面设计

---

## 1. 路由结构

```typescript
// config/routes.ts
export default [
    {path: '/login', component: './Login', layout: false},

    // ─── 销售端 ───
    {
        path: '/sales',
        name: '销售端',
        icon: 'ShoppingOutlined',
        access: 'sales',
        routes: [
            {path: '/sales/submit', name: '提交需求', component: './Sales/SubmitRequest'},
            {path: '/sales/mine', name: '我的需求', component: './Sales/MyRequests'},
            {path: '/sales/feed', name: '需求动态', component: './Sales/RequestFeed'},
        ],
    },

    // ─── 研究端 ───
    {
        path: '/researcher',
        name: '研究端',
        icon: 'ExperimentOutlined',
        access: 'researcher',
        routes: [
            {path: '/researcher/submit', name: '提交需求', component: './Researcher/SubmitRequest'},
            {path: '/researcher/tasks', name: '我的任务', component: './Researcher/MyTasks'},
            {path: '/researcher/feed', name: '需求动态', component: './Researcher/RequestFeed'},
        ],
    },

    // ─── 管理端 ───
    {
        path: '/admin',
        name: '管理端',
        icon: 'DashboardOutlined',
        access: 'admin',
        routes: [
            {path: '/admin/dashboard', name: '工作量看板', component: './Admin/Dashboard'},
            {path: '/admin/analytics', name: '多维分析', component: './Admin/Analytics'},
            {path: '/admin/export', name: '数据导出', component: './Admin/Export'},
            {
                path: '/admin/settings',
                name: '系统管理',
                routes: [
                    {path: '/admin/settings/users', name: '用户管理', component: './Admin/Settings/Users'},
                    {path: '/admin/settings/requests', name: '需求管理', component: './Admin/Settings/Requests'},
                    {path: '/admin/settings/orgs', name: '机构管理', component: './Admin/Settings/Orgs'},
                    {path: '/admin/settings/teams', name: '团队配置', component: './Admin/Settings/Teams'},
                ],
            },
        ],
    },
];
```

---

## 2. 页面详细设计

### 2.1 Login — 登录页

- 独立布局 (无侧边栏)
- 字段: username, password
- 登录后根据 role 自动跳转到对应端首页
- token 存 localStorage, 请求拦截器自动注入

---

### 2.2 Sales/SubmitRequest — 销售提交需求

**组件**: ProForm

| 字段              | 组件         | 说明                                      |
|-----------------|------------|-----------------------------------------|
| title           | Input      | 必填                                      |
| description     | TextArea   | 选填                                      |
| request_type    | Select     | 枚举, 必填                                  |
| research_scope  | Select     | 枚举, 选填                                  |
| org_name        | Select     | 从 `/organizations/by-team` 获取, 必填       |
| org_type        | 自动填入       | 选择机构后带入                                 |
| department      | Select     | 级联: 银行/券商/保险时显示                         |
| researcher_id   | Select     | 从 `/users/researchers` 获取 (含 admin), 必填 |
| is_confidential | Switch     | 默认关                                     |
| created_at      | DatePicker | 默认当前, 支持回溯                              |

---

### 2.3 Sales/MyRequests — 我的需求

**布局**: 统计卡片 + ProTable

**统计卡片** (顶部): 总数 / 待处理 / 处理中 / 已完成 / 已退回

**筛选器**: status, org_type, date_range, keyword

**表格列**: 标题, 机构, 需求类型, 研究员, 状态(Tag), 创建时间, 操作

**状态 Tag 颜色**:

- pending → 待处理 (橙色)
- in_progress → 处理中 (蓝色)
- completed → 已完成 (绿色)
- withdrawn → 已退回 (红色)
- canceled → 已取消 (灰色)

**操作列**:

- 查看详情 → Drawer 展示完整信息 (withdrawn 状态额外展示退回原因)
- 编辑 → 仅 pending/withdrawn 状态可用, Modal/Drawer 编辑表单
- 重新提交 → 仅 withdrawn 状态可用, 编辑后 status 回到 pending
- 取消 → 仅 pending/withdrawn 状态可用, Popconfirm 确认
- 下载附件 → 仅 completed 且有附件时可用

**withdrawn 状态特殊展示**:

- 在详情 Drawer 中显示「退回原因」和「退回研究员」
- 操作区显示「修改并重新提交」和「取消需求」按钮

---

### 2.4 Sales/RequestFeed — 需求动态

**说明**: 浏览已完成的公开需求 (scope=feed)

**筛选器**: request_type, research_scope, org_type, date_range

**表格列**: 标题, 需求描述, 需求类型, 研究范围, 机构类型, 研究员, 完成时间, 操作

> 注意: **不展示** org_name, department, work_hours, sales_name, is_confidential

**操作列**:

- 查看详情 → Drawer (feed 模式, 隐藏敏感字段)
- 下载附件 → 销售点击时弹窗选机构, 选好后下载

**额外功能**: 导出 Excel 按钮 (仅导出展示字段)

**下载选机构弹窗 (销售专用)**:

- 触发: 销售点击下载按钮
- Modal: Select 组件, 调 `/organizations/by-team` 获取机构列表
- 确认后: 调 `/files/download/:id?org_name=xxx` 下载并记录日志

---

### 2.5 Researcher/SubmitRequest — 研究员提交需求

同销售提交, 额外增加:

- `sales_id` Select (从 `/users/sales` 获取, 含 admin, 必填)
- 机构列表 → 根据所选销售的团队动态获取
- **admin 被选为销售时**: 机构列表显示全部

---

### 2.6 Researcher/MyTasks — 我的任务

**布局**: Tabs 切换

**Tab 1: 待处理** (pending, researcher_id = me)

- 卡片/列表展示
- 操作: ✅ 接受 / ↩️ 退回

**退回操作**:

- 点击退回 → Modal 弹窗, 必填退回原因 (TextArea)
- 确认后调 `POST /requests/:id/withdraw` body: `{ "reason": "..." }`

**Tab 2: 处理中** (in_progress, researcher_id = me)

- 操作: 上传附件 + 填写说明 + 填工时 → ✅ 标记完成
- 完成表单用 Modal 或 Drawer

**Tab 3: 已完成** (completed, researcher_id = me)

- 只读列表

**Tab 4: 我提交的** (created_by = me)

- 只读列表, 同 Sales/MyRequests 结构

> 注意: withdrawn 状态的需求**不出现**在研究员的任务列表中

---

### 2.7 Admin/Dashboard — 工作量看板

**顶部**: 时间周期选择器 (今日/本周/本月/当季/今年)

**第一行**: 5 个 StatisticCard (总数/待处理/处理中/已完成/总工时)

**第二行**: 研究员工作量排行表格

- 列: 排名, 姓名, 已完成, 处理中, 待处理, 总工时
- 行操作: 展开查看该研究员的需求明细

---

### 2.8 Admin/Analytics — 多维分析

**布局**: Tabs (6 个子视角)

**Tab 1: 统计看板**

- 饼图 × 2 (需求类型分布, 客户类型分布)
- 柱状图 × 1 (研究员工作量)

**Tab 2: 研究员视角**

- ProTable: 行=研究员, 列=今日/本周/本月/当季/今年
- 自动过滤全 0 行, 底部总计行

**Tab 3: 需求类型视角**

- ProTable: 行=需求类型, 列=时间维度

**Tab 4: 客户视角**

- ProTable: 行=机构, 列=需求数/工时

**Tab 5: 销售视角**

- ProTable: 行=销售, 列=时间维度

**Tab 6: 下载统计**

- Top 10 下载排行表格
- 近期下载记录 (最近 50 条)

---

### 2.9 Admin/Export — 数据导出

**筛选区** (ProForm): date_range, request_type, research_scope, sales_id, researcher_id, org_name, org_type, status

**预览区**: ProTable 展示前 20 条

**操作**: "导出 Excel" 按钮 → 调 `/exports/requests` 下载 (全字段)

---

### 2.10 Admin/Settings/Users — 用户管理

**列表**: ProTable (username, display_name, role Tag, team, created_at)

**操作**:

- 新建: Modal + ProForm (username, password, role, display_name, team_id)
- 编辑: Modal
- 重置密码: Popconfirm + 输入新密码
- 删除: Popconfirm

---

### 2.11 Admin/Settings/Requests — 需求管理

**列表**: ProTable (全字段, 多条件筛选)

**操作**:

- 编辑: Drawer + ProForm (所有字段可改)
- 重新分配: 改 researcher_id
- 切换保密: Switch
- 删除: Popconfirm

---

### 2.12 Admin/Settings/Orgs — 机构管理

**列表**: ProTable (name, org_type, created_at)

**操作**: 新建 / 编辑 / 删除

---

### 2.13 Admin/Settings/Teams — 团队配置

**列表**: ProTable (name, 机构数, 成员数, created_at)

**操作**:

- 新建团队
- 管理机构: Modal + Transfer 组件 (左: 全部机构, 右: 已分配)
- 管理成员: Modal + Transfer 组件 (左: 全部销售, 右: 已分配)
- 删除团队

---

## 3. 通用组件

| 组件                  | 用途                         | 使用页面                                    |
|---------------------|----------------------------|-----------------------------------------|
| RequestDetailDrawer | 需求详情抽屉, 接收 `mode` 参数控制字段展示 | MyRequests, MyTasks, RequestFeed, 管理端各处 |
| StatsCards          | 顶部统计卡片行                    | MyRequests, Dashboard                   |
| FileDownloadButton  | 下载按钮 (含日志上报)               | 所有有附件的列表                                |
| OrgSelectModal      | 销售下载时选机构弹窗                 | RequestFeed, MyRequests (feed 模式下载)     |
| PeriodSelector      | 时间周期选择器                    | Dashboard, Analytics                    |
| MultiDimensionTable | 多时间维度统计表格                  | Analytics 各子 Tab                        |

### RequestDetailDrawer mode 说明

| mode  | 场景        | 显示字段                                                             |
|-------|-----------|------------------------------------------------------------------|
| mine  | 我的需求/我的任务 | 全字段 (含 org_name, work_hours 等)                                   |
| feed  | 需求动态      | 隐藏 org_name, department, work_hours, sales_name, is_confidential |
| admin | 管理端       | 全字段                                                              |

withdrawn 状态时额外显示: 退回原因 (`withdraw_reason`), 退回研究员 (`researcher_name`)
