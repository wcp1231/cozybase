## MODIFIED Requirements

### Requirement: Agent 工作目录管理

`cozybase mcp` SHALL 管理 Agent 工作目录，位置通过以下优先级确定（从高到低）：

1. `--apps-dir` 参数
2. `COZYBASE_APPS_DIR` 环境变量
3. `process.cwd()`（当前工作目录）

每个 APP 对应一个子目录 `{apps_dir}/{app-name}/`，目录结构如下：
```
{apps_dir}/{app-name}/
├── app.yaml
├── migrations/
│   ├── 001_init.sql
│   └── 002_add_users.sql
├── seeds/
│   └── init.json
├── functions/
│   ├── hello.ts
│   └── stats.ts
└── ui/
    └── pages.json
```

Agent 工作目录 SHALL 与 cozybase 数据目录（`~/.cozybase/`）完全独立。两个目录可能在不同的机器上。

#### Scenario: 默认使用当前工作目录

- **WHEN** 运行 `cozybase mcp` 未指定 `--apps-dir` 且未设置 `COZYBASE_APPS_DIR`
- **THEN** 系统 SHALL 使用 `process.cwd()` 作为 Agent 工作目录根目录

#### Scenario: 通过参数配置工作目录

- **WHEN** 运行 `cozybase mcp --apps-dir /home/user/projects`
- **THEN** 系统 SHALL 使用 `/home/user/projects` 作为 Agent 工作目录根目录

#### Scenario: 通过环境变量配置工作目录

- **WHEN** 设置 `COZYBASE_APPS_DIR=/home/user/projects` 并运行 `cozybase mcp`
- **THEN** 系统 SHALL 使用 `/home/user/projects` 作为 Agent 工作目录根目录

#### Scenario: APP 子目录

- **WHEN** Agent 操作名为 "todo" 的 APP
- **THEN** 系统 SHALL 在 `{apps_dir}/todo/` 下读写该 APP 的文件
