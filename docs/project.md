# project.md — 项目元信息与技术规范

> 项目代号: demand-management-v3
> 重构自: Streamlit 单体应用 → 前后端分离架构
> 维护者: Jericho

---

## 1. 技术选型

### 后端

| 层      | 选型                  | 版本       | 说明                                   |
|--------|---------------------|----------|--------------------------------------|
| Web 框架 | FastAPI             | ≥0.115   | 异步高性能, 自带 OpenAPI 文档                 |
| ORM    | SQLAlchemy 2.0      | ≥2.0     | 使用声明式映射 + async session              |
| 数据校验   | Pydantic v2         | ≥2.9     | FastAPI 原生集成                         |
| 数据库    | SQLite → PostgreSQL | 先 SQLite | **保留现有 data.db**, 后续平滑切换             |
| 认证     | JWT (python-jose)   | —        | access_token + refresh_token 双 token |
| 密码     | passlib[bcrypt]     | —        | 替换现有 SHA256, 做兼容迁移                   |
| 文件存储   | 本地文件系统              | —        | 保持 `data/uploads/` 结构                |
| 任务调度   | APScheduler         | —        | 数据库备份、日志清理                           |
| 测试     | pytest + httpx      | —        | AsyncClient 测试 API                   |

### 前端
使用初始化时最新稳定版

| 层    | 选型                          | 说明                      |
|------|-----------------------------|-------------------------|
| 框架   | React 18                    | —                       |
| 脚手架  | Ant Design Pro v6           | 内置权限路由、ProTable、ProForm |
| UI 库 | Ant Design 5.x              | —                       |
| 图表   | @ant-design/charts (基于 G2)  | 替代 Plotly               |
| 状态管理 | zustand 或 Ant Design Pro 内置 | 轻量优先                    |
| 请求层  | umi-request / axios         | 统一拦截器处理 JWT 刷新          |
| 构建   | Umi 4                       | Ant Design Pro 默认       |
| 国际化  | 暂不需要                        | 纯中文系统                   |

### 部署

| 组件    | 方案                              |
|-------|---------------------------------|
| 前端    | Nginx 托管静态资源                    |
| 后端    | Uvicorn + NSSM (Windows Server) |
| 反向代理  | Nginx 统一入口, `/api/*` 转发后端       |
| 数据库备份 | APScheduler 每日凌晨 2 点            |

---

## 2. 目录结构

### 后端

```
server/
├── app/
│   ├── main.py                 # FastAPI 入口, 挂载路由
│   ├── core/
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   ├── database.py         # engine, SessionLocal, get_db
│   │   ├── security.py         # JWT 签发/验证, 密码哈希
│   │   └── deps.py             # Depends: get_current_user, require_role
│   │
│   ├── models/                 # SQLAlchemy 模型 (与现有表结构 1:1 映射)
│   │   ├── user.py
│   │   ├── request.py
│   │   ├── team.py
│   │   ├── organization.py
│   │   └── download_log.py
│   │
│   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── user.py
│   │   ├── request.py
│   │   ├── team.py
│   │   ├── organization.py
│   │   ├── stats.py
│   │   └── auth.py
│   │
│   ├── api/                    # 路由 (按资源分文件)
│   │   ├── auth.py             # POST /login, /refresh, /change-password
│   │   ├── requests.py         # CRUD /requests
│   │   ├── users.py            # CRUD /users (admin)
│   │   ├── teams.py            # CRUD /teams (admin)
│   │   ├── organizations.py    # CRUD /organizations (admin)
│   │   ├── stats.py            # GET /stats/* (admin)
│   │   ├── exports.py          # GET /exports/requests (admin)
│   │   └── files.py            # 上传/下载附件
│   │
│   ├── services/               # 业务逻辑 (从现有 services/ 平移)
│   │   ├── request_service.py
│   │   ├── stats_service.py
│   │   ├── user_service.py
│   │   ├── master_data_service.py
│   │   └── download_service.py
│   │
│   └── utils/
│       ├── datetime_utils.py   # 北京时间工具
│       └── export.py           # Excel 导出
│
├── data/
│   ├── data.db                 # ⚠️ 现有数据库 (直接复用)
│   ├── uploads/                # 附件目录
│   └── backups/
│
├── scripts/
│   ├── migrate_passwords.py    # SHA256 → bcrypt 兼容迁移
│   └── seed_data.py
│
├── requirements.txt
└── .env
```

### 前端

```
web/
├── src/
│   ├── pages/
│   │   ├── Login/              # 登录页
│   │   ├── Sales/              # 销售端
│   │   │   ├── SubmitRequest/  # 提交需求
│   │   │   ├── MyRequests/     # 我的需求
│   │   │   └── RequestFeed/    # 需求动态
│   │   ├── Researcher/         # 研究端
│   │   │   ├── SubmitRequest/
│   │   │   ├── MyTasks/        # 我的任务
│   │   │   └── RequestFeed/
│   │   └── Admin/              # 管理端
│   │       ├── Dashboard/      # 工作量看板
│   │       ├── Analytics/      # 多维分析
│   │       ├── Export/         # 数据导出
│   │       └── Settings/       # 系统管理
│   │           ├── Users/
│   │           ├── Requests/
│   │           ├── Orgs/
│   │           └── Teams/
│   │
│   ├── components/             # 通用组件
│   │   ├── RequestDetail/      # 需求详情抽屉
│   │   ├── StatsCards/         # 统计卡片
│   │   └── FileDownload/       # 下载按钮 (含日志上报)
│   │
│   ├── services/               # API 调用封装
│   │   ├── auth.ts
│   │   ├── requests.ts
│   │   ├── stats.ts
│   │   └── admin.ts
│   │
│   ├── access.ts               # 权限配置 (Ant Design Pro 约定)
│   ├── app.tsx                 # 全局布局 + 菜单
│   └── typings.d.ts            # 全局类型
│
├── package.json
└── config/
    └── routes.ts               # 路由配置
```

---

## 3. 编码规范

### 后端 (Python)

- PEP 8, 行宽 120
- Type Hints 必须: 函数签名 + 返回值
- 命名: `snake_case` 函数/变量, `PascalCase` 类
- API 函数命名: `动词_名词` (get_requests, create_user)
- SQL 查询: ORM 优先, 复杂统计可用 `text()` 原生 SQL
- 错误处理: 业务异常用 `HTTPException`, 不滥用 try-except
- 接口文档: FastAPI 自动生成, 补充 `summary` + `description`

### 前端 (TypeScript)

- ESLint + Prettier (Ant Design Pro 默认配置)
- 组件: 函数式 + Hooks, 禁止 class 组件
- 命名: `PascalCase` 组件, `camelCase` 函数/变量
- API 返回类型: 必须定义 TypeScript interface
- 状态: 页面级用 `useState`, 跨页面用 zustand store
- ProTable/ProForm: 优先使用 Ant Design Pro 高级组件

### Git 规范

```
feat(scope): 新功能          fix(scope): 修复
docs: 文档                   refactor: 重构
perf: 性能优化               test: 测试
chore: 构建/工具              style: 格式
```

---

## 4. API 设计规范

### 通用响应格式

```json
// 成功
{
  "code": 0,
  "data": {
    ...
  },
  "message": "ok"
}

// 分页
{
  "code": 0,
  "data": {
    "items": [
      ...
    ],
    "total": 100
  },
  "message": "ok"
}

// 错误
{
  "code": 40001,
  "data": null,
  "message": "用户名或密码错误"
}
```

### RESTful 约定

| 动作 | 方法     | 路径                    | 示例                          |
|----|--------|-----------------------|-----------------------------|
| 列表 | GET    | /resources            | GET /api/requests           |
| 详情 | GET    | /resources/:id        | GET /api/requests/1         |
| 创建 | POST   | /resources            | POST /api/requests          |
| 更新 | PUT    | /resources/:id        | PUT /api/requests/1         |
| 删除 | DELETE | /resources/:id        | DELETE /api/requests/1      |
| 操作 | POST   | /resources/:id/action | POST /api/requests/1/accept |

### 认证

- 所有 `/api/*` 需 JWT, 除 `/api/auth/login`
- Header: `Authorization: Bearer <token>`
- access_token 有效期 24h, refresh_token 7d
- 角色鉴权通过 FastAPI Depends 注入

---

## 5. 数据库迁移策略

**核心原则: 现有 data.db 零数据损失迁移**

1. **表结构**: 完全保留, SQLAlchemy 模型 1:1 映射现有表
2. **密码**: 新增 `password_version` 字段, 首次登录时自动从 SHA256 迁移到 bcrypt
3. **时间字段**: 统一为 UTC 存储, 前端展示时转北京时间
4. **新增字段**: 通过 ALTER TABLE 追加, 不破坏现有数据
5. **后续切 PostgreSQL**: 仅改 `DATABASE_URL`, ORM 层无感知
