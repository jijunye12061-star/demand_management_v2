# 第一次对话（项目初始化 + 登录）
```markdown
# 角色
你是前端架构师，负责用 React + Ant Design Pro v6 构建一个内部需求管理系统的前端。

# 项目背景
这是一个从 Streamlit 单体应用重构为前后端分离的项目。后端已由 FastAPI 实现完毕。
你只负责前端。

# 技术约定
（把 project.md 中「前端」部分 + 「编码规范 > 前端」部分 + 「API 设计规范 > 通用响应格式」贴进来）

# 后端 API 文档
（把 api.md 中「认证 /auth」部分贴进来）

# 当前任务
请完成以下任务：

## 任务 1: 项目初始化 (P0-4)
- npm create umi 初始化 Ant Design Pro v6
  - 清理默认示例
  - 配置 proxy: /api → http://localhost:8000
  - 中文配置

## 任务 2: 登录页 + Token 管理 (P1-4)
- pages/Login/index.tsx: ProForm 登录表单
  - services/auth.ts: login(), refresh(), changePassword()
  - Token 存 localStorage
  - 请求拦截器: Authorization header 注入, 401 跳转登录
  - app.tsx: getInitialState() 获取用户信息

## 任务 3: 权限路由 (P1-5)
- access.ts: 三角色权限控制
  - 完整路由配置如下：
  （把 pages.md 中「路由结构」部分贴进来）

# 验证标准
- npm run dev 启动成功
  - 登录后根据角色跳转到对应首页
  - sales 登录只能看到销售端菜单
```

# 第二次对话
```markdown
# 上下文
（简要说明项目 + 贴 project.md 技术约定）

# 已完成
登录 + 权限路由已完成，代码结构如下：
（贴当前目录结构，或关键文件的 import 关系）

# 后端 API
（从 api.md 中贴出 销售端会用到的接口：GET /requests, POST /requests,
  GET /organizations/by-team, GET /users/researchers, GET /files/download/:id）

# 业务规则
（从 business-rules.md 中贴出：保密可见性规则、部门级联规则）

# 页面设计
（从 pages.md 中贴出 2.2 ~ 2.4 销售端三个页面的详细设计）

# 当前任务
P4-1: 提交需求页
P4-2: 我的需求页
P4-3: 需求动态页
P4-4: 通用组件抽取 (RequestDetailDrawer, StatsCards, FileDownloadButton)

# 验证标准
- 提交需求后在「我的需求」能看到
  - 机构下拉仅显示当前用户团队关联的机构
  - 银行/券商/保险选中时出现部门下拉
  - 需求动态只展示已完成的公开需求
```


# 后续对话以此类推

每次给 Gemini 的 prompt 遵循这个模板：
```
1. 技术约定（首次完整给，后续简要提醒）
2. 已完成的上下文（目录结构/关键代码）
3. 本次用到的 API 端点（从 api.md 摘取）
4. 本次涉及的业务规则（从 business-rules.md 摘取）
5. 页面设计（从 pages.md 摘取）
6. 具体任务列表（从 tasks.md 摘取）
7. 验证标准
```