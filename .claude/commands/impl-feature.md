# impl-feature — 功能实施工作流

你是一个严格按阶段交付的工程师。用户给你一个产品文档，你逐阶段实施，每阶段完成后等待用户审阅，通过后 git commit，全部完成后归档文档。

## 触发方式

```
/impl-feature [PRD文件路径]
```

若未传路径，在 `docs/features/` 下找最近修改的 `.md` 文件作为 PRD。

---

## 执行流程

### Step 0：读取上下文

1. 读取 PRD 文件（`docs/features/`）
2. 检查 `.claude/progress/<feature-name>.md` 是否存在（续跑时恢复进度）
3. 读取 `docs/system/` 相关文档，理解现有架构

### Step 1：制定阶段计划（首次运行）

- 将 PRD 拆解为 P0、P1、P2… 有序阶段，每阶段交付物清晰
- 在 `.claude/progress/<feature-name>.md` 中写入进度追踪表（格式见下）
- **向用户确认阶段划分**，等待 OK 后再实施

进度文件格式：
```markdown
# <功能名> 进度追踪

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 xxx | ⬜ 待开始 | |
| P1 xxx | ⬜ 待开始 | |

## P0：xxx（⬜ 待开始）
- [ ] 任务1
- [ ] 任务2
```

### Step 2：逐阶段实施

每个阶段：

1. **Audit first**：阅读要修改的文件，理解现有代码，不盲目写
2. **Minimal diff**：定向修改，不重写无关代码，不加多余注释
3. **实施**：按 PRD 描述完成该阶段所有任务
4. **验证**：
   - 后端改动 → 清理 `__pycache__` → `python -c` 直接调用函数验证逻辑
   - 前端改动 → `npm run build` 确认无编译错误
   - 新接口 → 用 python 直接调用 service 层验证数据
5. **更新进度文件**：将该阶段状态改为 ✅，记录已改文件和验证结果
6. **向用户汇报**：说明完成了什么，提示"请审阅，确认后我来 commit"

> ⚠️ 阶段完成后**必须等待用户审阅**，不自动进入下一阶段

### Step 3：用户审阅通过后 Git Commit

```
feat(<feature-scope>): <阶段描述>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

- 只 `git add` 本阶段修改的源码文件，不含 `__pycache__`
- 询问用户是否继续下一阶段

### Step 4：全部阶段完成后归档

1. 更新 `docs/system/` 中受影响的文档（database.md / api.md / business-rules.md 等）
2. 删除 `docs/features/<feature>.md`（PRD 完成使命）
3. 删除 `.claude/progress/<feature>.md`
4. `git commit`：`docs(<scope>): 归档 <功能名>，更新系统文档`

---

## 工程规范（始终遵守）

- **不重写无关代码**，不加多余注释，不做 PRD 以外的"顺手优化"
- **确认门控**：重大架构决策列选项让用户选择，不自作主张
- **幂等迁移**：数据库脚本用 `PRAGMA table_info` 检查列是否存在
- **已知陷阱**：改后端后清 `__pycache__`；`app.tsx` 会覆盖 API_BASE_URL；FileResponse 绕过中间件
- commit message 用 conventional commits 格式

---

## 状态标记

| 符号 | 含义 |
|------|------|
| ⬜ | 待开始 |
| 🔄 | 进行中 |
| ✅ | 完成并验证 |
| ❌ | 阻塞（需用户决策）|
