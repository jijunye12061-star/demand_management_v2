# OpenSpec — 需求管理系统 v3.0

> Streamlit 单体 → FastAPI + React (Ant Design Pro) 前后端分离重构

---

## 文档索引

| 文件                                       | 内容                             | 何时参考          |
|------------------------------------------|--------------------------------|---------------|
| [proposal.md](./proposal.md)             | 系统提案: 功能边界、角色模型、状态流转、明确排除项     | 立项阶段, 判断"做不做" |
| [project.md](./project.md)               | 技术选型、目录结构、编码规范、API 设计规范        | 写代码前, 统一约定    |
| [database.md](./database.md)             | 数据库表结构、迁移策略、索引建议               | 写模型和查询时       |
| [api.md](./api.md)                       | 全量 API 端点定义 (请求/响应/权限)         | 后端开发、前端对接     |
| [business-rules.md](./business-rules.md) | 权限矩阵、保密规则、状态流转、feed字段过滤、下载日志逻辑 | 实现具体逻辑时       |
| [pages.md](./pages.md)                   | 前端路由、页面布局、组件设计                 | 前端开发时         |
| [tasks.md](./tasks.md)                   | 原子任务拆解, 依赖关系, 工期估算             | 排期和执行时        |

---

## 快速开始

```bash
# 1. 后端
cd server
pip install -r requirements.txt
cp .env.example .env       # 配置 DATABASE_URL 指向现有 data.db
python scripts/migrate_v3.py  # 新增 withdraw_reason + password_version 字段
uvicorn app.main:app --reload --port 8000

# 2. 前端
cd web
npm install
npm run dev                # 默认 proxy /api → localhost:8000
```

---

## 核心状态流转

```
pending → in_progress (研究员接受)
pending → withdrawn   (研究员退回 + 填原因)
withdrawn → pending   (销售修改后重新提交)
withdrawn → canceled  (销售取消需求)
pending → canceled    (销售撤回未处理需求)
in_progress → completed (研究员完成)
```

---

## 执行顺序建议

Phase 0 → 1 → 2 → 3 (后端先行, 用 /docs 自测)
→ Phase 4 → 5 (销售/研究前端, 并行于 Phase 6)
→ Phase 6 → 7 (统计 API + 管理前端)
→ Phase 8 (联调收尾)
