# Reconciler 引擎

Reconciler 是 cozybase 的核心组件，负责将 workspace 中的声明式 YAML spec 同步为数据库中的实际 schema。

## 核心概念

### 期望状态 vs 实际状态

```
期望状态 (Desired State)     实际状态 (Actual State)
───────────────────────     ──────────────────────
tables/todos.yaml           SQLite: todos 表
  columns:                    PRAGMA table_info
    - id (text, pk)             → id TEXT PK
    - title (text, required)    → title TEXT NOT NULL
    - priority (integer)        → (不存在)

                         Reconciler 差异:
                           +column: priority INTEGER

                         执行: ALTER TABLE todos ADD COLUMN priority INTEGER
```

### 状态追踪

Platform DB (cozybase.sqlite) 中的 `resource_state` 表记录每个资源的最后 reconcile 状态：

```sql
CREATE TABLE resource_state (
  app_name TEXT NOT NULL,
  resource_type TEXT NOT NULL,    -- 'table' | 'function' | 'cron' | 'bucket'
  resource_name TEXT NOT NULL,
  spec_hash TEXT NOT NULL,        -- YAML 文件内容的 SHA256
  applied_at TEXT,                -- 最后 apply 时间
  PRIMARY KEY (app_name, resource_type, resource_name)
);
```

每次 reconcile 后更新 `spec_hash`，下次 reconcile 时通过比较 hash 跳过未变更的资源。

## Reconcile 流程

### 全量 Reconcile (reconcileAll)

在 daemon 启动时执行一次：

```
reconcileAll()
│
├── scanWorkspace(workspaceDir)
│   └── 发现所有含 app.yaml 的目录
│
├── for each app:
│   ├── 检查 apps 表是否存在该 app
│   │   └── 不存在 → INSERT INTO apps
│   │
│   └── reconcileApp(app)
│
└── 检查孤儿 app
    └── apps 表中存在但 workspace 中不存在 → 警告 (数据保留)
```

### 单 App Reconcile (reconcileApp)

Watcher 检测到文件变更时，只 reconcile 受影响的 App：

```
reconcileApp(app)
│
├── Tables 处理:
│   │
│   ├── for each tables/*.yaml:
│   │   ├── 计算文件 SHA256
│   │   ├── 与 resource_state 中的 hash 对比
│   │   ├── hash 相同 → 跳过
│   │   ├── 表不存在 → CREATE TABLE
│   │   ├── 表已存在 → diffAndMigrateTable()
│   │   ├── reconcileIndexes()
│   │   └── 更新 resource_state 中的 hash
│   │
│   └── 检查孤儿表:
│       └── resource_state 中有记录但 workspace 中无文件 → 警告
│
└── Functions 处理:
    └── for each functions/*.ts:
        └── 更新 resource_state (hash tracking only)
```

## Schema Diff 规则

### 安全的自动变更

| 变更类型 | 处理方式 | SQL |
|----------|----------|-----|
| 新增列 | 自动执行 | `ALTER TABLE ADD COLUMN` |
| 新增索引 | 自动执行 | `CREATE INDEX` |
| 删除索引 | 自动执行 | `DROP INDEX` |

### 需警告的变更

| 变更类型 | 处理方式 | 原因 |
|----------|----------|------|
| 删除列 | 仅警告，不执行 | 防止数据丢失；SQLite 不支持 DROP COLUMN (旧版本) |
| 列类型变更 | 仅警告，不执行 | SQLite 不支持 ALTER COLUMN TYPE |
| 添加 NOT NULL | 仅警告，不执行 | 可能与现有数据冲突 |

### ALTER TABLE ADD COLUMN 的限制

SQLite 对 `ALTER TABLE ADD COLUMN` 有约束：

- 新列不能有 `NOT NULL` 但无 `DEFAULT` 值（已有数据行无法填充）
- Reconciler 处理：如果列同时有 `required: true` 和 `default`，会生成 `NOT NULL DEFAULT ...`
- 如果列有 `required: true` 但无 `default`，`NOT NULL` 会被跳过以避免错误

## Column Diff 算法

```typescript
diffAndMigrateTable(db, appName, tableName, spec, currentColumns):
  currentNames = Set(currentColumns.map(c => c.name))
  specNames = Set(spec.columns.map(c => c.name))

  // 新增列
  for col in spec.columns:
    if col.name not in currentNames:
      parts = [col.name, col.type.toUpperCase()]
      if col.default: parts.push(DEFAULT col.default)
      if col.required AND col.default: parts.push(NOT NULL)
      ALTER TABLE tableName ADD COLUMN ...

  // 删除列
  for col in currentColumns:
    if col.name not in specNames:
      warn("Column removed from spec, data preserved")
```

## Index Reconcile 算法

```typescript
reconcileIndexes(db, appName, tableName, specIndexes):
  currentIndexes = PRAGMA index_list(tableName)
  // 忽略 sqlite_autoindex_* (SQLite 内部索引)
  currentNonAuto = filter(i => !i.name.startsWith('sqlite_autoindex_'))

  desired = Map<name, IndexSpec>
  for idx in specIndexes:
    name = idx.name ?? "idx_{tableName}_{columns.join('_')}"
    desired.set(name, idx)

  // 创建缺失的索引
  for [name, idx] in desired:
    if name not in currentNonAuto:
      CREATE [UNIQUE] INDEX name ON tableName (columns)

  // 删除多余的索引
  for idx in currentNonAuto:
    if idx.name not in desired:
      DROP INDEX idx.name
```

## Watcher 机制

### 文件监听

使用 Node.js `fs.watch` 的 `recursive: true` 模式监听整个 workspace 目录：

```typescript
watch(workspaceDir, { recursive: true }, (event, filename) => {
  // filename: "todo-app/tables/todos.yaml"
  const appName = extractAppName(filename); // → "todo-app"
  changedApps.add(appName);
  scheduleReconcile();
});
```

### Debounce 策略

- 文件变更通常成批发生（编辑器保存、git checkout 等）
- 500ms debounce 窗口：收集这段时间内所有变更
- 只对受影响的 App 执行 reconcile，不做全量扫描
- 使用 `Set<string>` 去重，同一 App 多次变更只 reconcile 一次

```
t=0ms     todo-app/tables/todos.yaml 变更 → changedApps.add('todo-app')
t=100ms   todo-app/tables/users.yaml 变更 → changedApps.add('todo-app') (已存在)
t=200ms   blog-app/tables/posts.yaml 变更 → changedApps.add('blog-app')
t=700ms   debounce 触发:
          → reconcileApp('todo-app')
          → reconcileApp('blog-app')
```

### 忽略规则

- 以 `.` 开头的文件/目录（如 `.git`）
- 无法从路径提取有效 App 名称的文件

## 错误处理

| 场景 | 行为 |
|------|------|
| YAML 解析失败 | 跳过该资源，输出错误日志 |
| SQL 执行失败 | 打印 reconcile error，跳过该 App |
| Workspace 目录不存在 | 启动时报错退出 |
| app.yaml 为空 | 正常处理（空描述） |
| 表没有列 | Zod 验证失败（min 1 column），跳过 |

## 幂等性保证

多次执行相同的 reconcile 不会产生副作用：

1. **Hash 检查**：文件内容没变 → spec_hash 相同 → 跳过
2. **CREATE TABLE IF NOT EXISTS**：不会重复建表（但实际通过 PRAGMA 检查列数为 0 来判断）
3. **CREATE INDEX IF NOT EXISTS**：不会重复建索引
4. **INSERT OR REPLACE**：resource_state 更新是幂等的
