# ai-app-creation-flow Specification

## Purpose

定义从用户自由文本输入到 APP 自动创建、Draft 环境初始化、Agent 启动的完整 AI 驱动创建流程。

## MODIFIED Requirements

### Requirement: APP 创建内含自动 reconcile

`manager.create()` 在创建 APP 模板文件并提交事务后 SHALL 自动调用 `DraftReconciler.reconcile(slug)` 初始化 Draft 环境。创建流程 MUST 在模板文件中包含 `ui/pages.json`，且其初始内容 MUST 为 `{"pages": []}`，以保证页面工具可直接读取与编辑。

#### Scenario: 新建 APP 自动生成空白页面模板

- **WHEN** 通过 `manager.create()` 创建 APP `fitness-tracker`
- **THEN** 创建流程 SHALL 在 APP 目录下生成 `ui/pages.json`
- **AND** `ui/pages.json` 内容 SHALL 为 `{"pages": []}`
- **AND** 页面工具 SHALL 能基于该文件直接执行后续页面操作

#### Scenario: 新建 APP 自动拥有可访问的 Draft 页面

- **WHEN** 通过 `manager.create()` 创建 APP `fitness-tracker`
- **THEN** 创建流程 SHALL 在事务完成后自动执行 reconcile
- **AND** 前端跳转到 `/apps/fitness-tracker` 时 Draft 页面 SHALL 立即可访问

#### Scenario: reconcile 失败不回滚 APP 创建

- **WHEN** `manager.create()` 成功但后续 reconcile 失败
- **THEN** APP 记录 SHALL 保留在数据库中
- **AND** 返回值 SHALL 包含 reconcile 失败信息，前端可据此提示用户
