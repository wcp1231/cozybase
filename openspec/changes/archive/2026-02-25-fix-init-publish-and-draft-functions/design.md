## Context

存在两个 Bug：

**Bug 1**: `workspace.init()` 复制模板文件 + git commit 后，未执行 Publish。模板 App 的状态被 `refreshAppState()` 错误地分类为 `'stable'`（第 248 行：无 stable DB 且无 unstaged changes → 兜底返回 `'stable'`），但实际上 `data/apps/{name}/db.sqlite` 并不存在，导致 Stable 路由访问失败。

**Bug 2**: `DirectRuntime.execute()` 的 Draft 模式从 `app.specDir`（`apps/{name}/functions/`）直接加载函数文件（第 29 行），修改源码即刻生效。与 Draft DB 需要 Reconcile 后才更新的隔离模型不一致。

## Goals / Non-Goals

**Goals:**

- 修复 App 状态推导：无 stable DB 的情况统一归为 `'draft_only'`
- 初始化完成后自动 Publish 模板应用，使其可通过 Stable 路由正常访问
- Draft Functions 通过 Reconcile 隔离：reconcile 时复制函数到 `draft/apps/{name}/functions/`，Draft 模式从该目录加载
- 补充 E2E 测试覆盖上述场景

**Non-Goals:**

- 不改变 Stable 模式函数加载逻辑（已正确从 `data/apps/{name}/functions/` 加载）
- 不改变 Publish 流程（已正确复制函数到 stable data dir）

## Decisions

### 1. 修复 App 状态推导

当前 `refreshAppState()` 中，无 stable DB 且无 unstaged changes 的情况错误地返回 `'stable'`。修改为返回 `'draft_only'`：

```typescript
// 修改前（workspace.ts 第 248-250 行）
} else {
  // No stable DB and no unstaged changes — treat as stable
  state = 'stable';
}

// 修改后
} else {
  // No stable DB — app exists but has never been published
  state = 'draft_only';
}
```

**为什么不新增一个状态？** 'draft_only' 语义精确：App 有声明文件但无 Stable 版本。无需额外状态。

### 2. 初始化后自动 Publish：在 `createServer()` 中执行

在 `server.ts` 中，`workspace.init()` + `workspace.load()` + 创建 `Publisher` 之后，扫描所有 `draft_only` 状态的 App 并自动 Publish：

```typescript
// server.ts — init 后自动 Publish
if (justInitialized) {
  for (const appDef of workspace.scanApps()) {
    const state = workspace.getAppState(appDef.name);
    if (state === 'draft_only') {
      publisher.publish(appDef.name);
    }
  }
}
```

**为什么不在 workspace.init() 内部做？** init() 是纯文件操作（创建目录、复制文件、git），不应依赖 `Publisher`、`MigrationRunner` 等业务组件。在 server 层做编排更合理。

**为什么不仅限于 "刚初始化" 的场景？** 理论上任何 `draft_only` 的 App 都可以自动 Publish，但目前只在首次初始化时做，避免意外行为。用 `justInitialized` 标记区分。

### 3. Draft Reconcile 增加函数复制步骤

在 `DraftReconciler.reconcile()` 中，执行完 migrations + seeds 之后，增加一步：将 `apps/{name}/functions/` 下的函数文件复制到 `draft/apps/{name}/functions/`。

```
reconcile 流程:
1. 销毁 draft DB                    (已有)
2. 执行 migrations                   (已有)
3. 加载 seeds                        (已有)
4. 复制 functions 到 draft 目录       (新增)
5. 验证 functions                    (已有，改为从 draft 目录验证)
```

复制逻辑参考 `Publisher.copyFunctionsToStable()` 模式：先清空目标目录再全量复制。

### 4. Draft 模式函数加载路径变更

`DirectRuntime.execute()` 中 Draft 模式的 `baseDir` 从 `app.specDir` 改为 `app.draftDataDir`：

```typescript
// 修改前
const baseDir = mode === 'draft' ? app.specDir : app.stableDataDir;

// 修改后
const baseDir = mode === 'draft' ? app.draftDataDir : app.stableDataDir;
```

Draft 模式仍保留 cache-bust（每次请求 `import(path + '?t=' + Date.now())`），但读取的是 draft 目录的副本，而非源文件。源文件修改后需 Reconcile 才生效。

### 5. 函数验证改为从 draft 目录执行

`DraftReconciler.validateFunctions()` 的读取路径从 `apps/{name}/functions/` 改为 `draft/apps/{name}/functions/`，确保验证的是复制后的副本。

## Risks / Trade-offs

- **开发体验变化** → Draft Functions 不再热重载，需 Reconcile 后生效。收益是与 Draft DB 行为一致，减少 "只改了函数为什么没效果" 的混乱。开发者工作流变为：编辑源码 → Reconcile → 测试。
- **状态推导修改影响范围** → 将 "无 stable DB + 无 unstaged" 从 `'stable'` 改为 `'draft_only'`。这会影响已 git commit 但从未 Publish 的 App。由于 init 后立即自动 Publish，正常流程下不会出现意外状态。
- **初始化耗时增加** → 自动 Publish 需要执行 migrations + 复制文件。对于单个 welcome App，增加耗时可忽略。
