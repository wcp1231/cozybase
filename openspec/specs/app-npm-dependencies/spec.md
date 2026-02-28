# app-npm-dependencies Specification

## Purpose
TBD - created by archiving change redesign-workspace-structure. Update Purpose after archive.
## Requirements
### Requirement: APP npm 依赖声明

每个 APP SHALL 可以通过 `package.json` 声明自己的 npm 依赖。`package.json` 作为普通 app file 存储在 `app_files` 表中，`path = "package.json"`。

APP 各自管理独立的 `node_modules/`，不同 APP 之间不共享依赖，可以使用同一包的不同版本。

模板 `package.json` 的默认内容 SHALL 仅包含 `name` 和 `version` 字段，其余内容由 AI Agent 按需填写：

```json
{
  "name": "{appName}",
  "version": "1.0.0"
}
```

#### Scenario: APP 声明 npm 依赖

- **WHEN** `app_files` 中存在 `path = "package.json"`，内容包含 `dependencies: { "dayjs": "^1.11.0" }`
- **THEN** reconcile 或 publish 后，该依赖 SHALL 安装到对应 app 目录的 `node_modules/` 中

#### Scenario: APP 无 package.json

- **WHEN** `app_files` 中不存在该 APP 的 `package.json` 记录
- **THEN** 系统 SHALL 跳过 `package.json` 导出和 `bun install` 步骤，不报错，APP 核心功能（functions、db）正常运行

#### Scenario: 不同 APP 使用同一包的不同版本

- **WHEN** appA 的 `package.json` 声明 `"lodash": "^3.0.0"`，appB 的 `package.json` 声明 `"lodash": "^4.0.0"`
- **THEN** 两个 APP 各自安装到自己的 `node_modules/`，互不影响

### Requirement: npm 依赖自动安装

系统 SHALL 在 reconcile 和 publish 流程中，于 `package.json` 导出后自动运行 `bun install` 安装 APP 的 npm 依赖。

`bun install` SHALL 在 app 目录中运行（`cwd: stable/{appName}/` 或 `draft/{appName}/`），确保依赖安装到 app 自身的 `node_modules/`。

`bun install` 失败（如网络问题）SHALL 不阻断 reconcile/publish 主流程，但 SHALL 在返回结果中记录警告信息。

#### Scenario: reconcile 后自动安装依赖

- **WHEN** reconcile 完成 `package.json` 导出到 `draft/{appName}/package.json`
- **THEN** 系统 SHALL 在 `draft/{appName}/` 目录运行 `bun install`，将依赖安装到 `draft/{appName}/node_modules/`

#### Scenario: publish 后自动安装依赖

- **WHEN** publish 完成 `package.json` 导出到 `stable/{appName}/package.json`
- **THEN** 系统 SHALL 在 `stable/{appName}/` 目录运行 `bun install`，将依赖安装到 `stable/{appName}/node_modules/`

#### Scenario: bun install 增量安装（依赖未变化）

- **WHEN** `package.json` 内容未发生变化，再次运行 reconcile 或 publish
- **THEN** `bun install` 利用 lockfile 缓存，SHALL 在极短时间内完成（无需重新下载）

### Requirement: 函数代码 npm 包解析

Runtime 动态 import 函数文件时，SHALL 能正确解析该函数所在 APP 目录中的 `node_modules/`。

Bun 的模块解析算法从被 import 文件的路径向上遍历目录，直至找到 `node_modules/`。由于函数文件位于 `stable/{appName}/functions/` 或 `draft/{appName}/functions/` 下，解析路径会经过 `stable/{appName}/` 或 `draft/{appName}/`，从而命中 APP 的 `node_modules/`。

同一 Bun 进程中运行的多个 APP SHALL 各自独立解析自己的依赖，互不干扰。
