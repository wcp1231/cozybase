## MODIFIED Requirements

### Requirement: Draft Reconcile（开发流程）

Draft Reconcile 流程增加函数复制步骤，修改后完整流程为：

1. 删除 `draft/apps/{appName}/db.sqlite`（若存在）
2. 创建 `draft/apps/{appName}/` 目录（若不存在）
3. 创建新的空 SQLite 数据库，启用 WAL 模式和 foreign keys
4. 按顺序执行 `apps/{appName}/migrations/` 下所有 `.sql` 文件
5. 加载 `apps/{appName}/seeds/` 下所有 seed 文件
6. **复制 `apps/{appName}/functions/` 下所有文件到 `draft/apps/{appName}/functions/`（先清空目标目录再全量复制）**
7. 验证 `draft/apps/{appName}/functions/` 下所有 `.ts` 文件（从 draft 目录验证，而非源码目录）
8. 返回执行结果

函数复制逻辑：
- 若目标目录 `draft/apps/{appName}/functions/` 已存在，SHALL 先删除再重新创建
- 使用逐文件复制（`copyFileSync`），仅复制 `functions/` 下的直接文件
- 若源目录 `apps/{appName}/functions/` 不存在或为空，SHALL 跳过复制步骤，不报错

函数验证步骤 SHALL 从 `draft/apps/{appName}/functions/` 目录读取文件进行验证，确保验证的是复制后的副本。

#### Scenario: Reconcile 复制函数文件到 draft 目录

- **WHEN** Agent 调用 `POST /draft/apps/todo-app/reconcile`，`apps/todo-app/functions/` 下有 `orders.ts` 和 `users.ts`
- **THEN** 系统 SHALL 在执行 migration 和 seed 之后，将 `orders.ts` 和 `users.ts` 复制到 `draft/apps/todo-app/functions/`，然后从 draft 目录验证函数

#### Scenario: Reconcile 时源 functions 目录不存在

- **WHEN** Agent 调用 Reconcile，但 `apps/{appName}/functions/` 目录不存在
- **THEN** 系统 SHALL 跳过函数复制和验证步骤，不报错

#### Scenario: 重复 Reconcile 清理旧函数副本

- **WHEN** Agent 连续两次调用 Reconcile，第一次时有 `orders.ts`，第二次时 `orders.ts` 被删除
- **THEN** 第二次 Reconcile SHALL 先清空 `draft/apps/{appName}/functions/` 目录再复制，确保不残留已删除的函数文件
