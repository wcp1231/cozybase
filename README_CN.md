# Cozybase

Cozybase 是一个面向 AI Agent 的本地 BaaS（Backend-as-a-Service）平台。

它为 AI Agent 提供完整的应用构建运行时：数据库迁移、TypeScript 函数、声明式 UI 页面，以及安全的 Draft-to-Stable 发布流程。用户用自然语言描述应用，AI Agent 通过 Cozybase 构建和测试应用，Cozybase 在本地提供服务。

## Features

- **AI 驱动的应用构建** — 内置 AI 聊天面板，用自然语言描述应用，Agent 自动处理数据库、函数、UI 和部署。
- **Draft / Stable 双环境** — 每个应用拥有隔离的 Draft 和 Stable 运行时，变更在 Draft 中测试后才能发布。
- **数据库迁移** — Schema 变更以有序、不可变的迁移文件管理，存储在 `platform.sqlite` 中。
- **TypeScript 函数** — 以 TypeScript 编写服务端逻辑，在沙箱运行时中执行。
- **声明式 UI 页面** — 基于 React 和 Radix UI 的声明式组件模型构建应用界面。
- **MCP / ACP 协议** — 通过 MCP 协议暴露完整工作流，可接入你自己的编程 Agent（Claude Code、Cursor 等）。
- **桌面应用** — 基于 Tauri 的原生桌面应用。

## 安装指南

### 前置条件

- 已安装 [Codex](https://github.com/openai/codex) 或 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)。

### 安装 Cozybase

1. 前往 [Releases](https://github.com/wcp1231/cozybase/releases) 页面，下载最新的 `.app`（macOS）文件。
2. 打开下载的文件，将 **Cozybase** 拖入 `Applications` 文件夹。
3. 从 Applications 启动 Cozybase。

## 开发指南

### 仓库结构

```text
packages/
├── daemon          # 核心服务、工作区管理、发布/同步、MCP/ACP、CLI
├── runtime         # 轻量级函数执行和数据库路由运行时
├── ui              # 共享 React UI 组件库（Radix UI + TailwindCSS v4）
├── web             # 浏览器 SPA 和内置 AI 聊天（React 19 + Vite）
├── desktop         # Tauri 2 原生桌面应用
├── ai-runtime      # AI 运行时抽象层（Claude、Codex、Pi Agent）
├── builder-agent   # 用于构建/修改应用的 AI Agent
├── cozybase-agent  # Cozybase 专属 Agent 实现
└── operator-agent  # 运维任务 Agent
```

### 常用命令

```bash
bun run dev                  # 构建 UI 组件并启动 daemon
bun run build:web            # 构建 UI + Web 前端
bun run builder-mcp          # 启动 MCP 服务（供外部 Agent 接入）
bun run desktop:dev          # 启动桌面应用（Tauri 开发模式）
bun run desktop:build        # 构建桌面应用发布包
```

## 更多文档

用户文档位于 [`docs/`](./docs/) 目录：

- [什么是 Cozybase](./docs/what-is-cozybase.md)
- [快速开始](./docs/getting-started.md)
- [用 AI Agent 构建你的第一个应用](./docs/build-your-first-app-with-ai-agent.md)
- [Draft vs Stable](./docs/draft-vs-stable.md)
- [发布与安全机制](./docs/publish-and-safety.md)
- [Prompt 示例](./docs/prompt-examples.md)
- [接入你自己的 Agent](./docs/use-your-own-agent.md)
- [UI 编辑器](./docs/ui-editor.md)

AI Agent 内部参考文档位于 `packages/daemon/guides/`。
