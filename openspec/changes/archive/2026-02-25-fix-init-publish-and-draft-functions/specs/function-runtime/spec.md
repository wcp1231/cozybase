## MODIFIED Requirements

### Requirement: DirectRuntime 实现

Draft 模式函数加载路径变更：

- **Draft 模式**：每次请求 SHALL 从 `draft/apps/{appName}/functions/` 目录加载函数文件（通过 query string cache bust 绕过模块缓存）。函数文件由 Reconcile 流程复制到该目录，修改源码后需 Reconcile 才生效。
- **Stable 模式**：行为不变，从 `data/apps/{appName}/functions/` 目录加载并缓存。

> 此变更使 Draft Functions 的生命周期与 Draft DB 一致：编辑源码 → Reconcile → Draft 可用 → Publish → Stable 可用。

#### Scenario: Draft 模式从 draft 目录加载函数

- **WHEN** Draft 模式下请求执行函数 `orders`
- **THEN** 系统 SHALL 从 `draft/apps/{appName}/functions/orders.ts` 加载函数文件，而非从 `apps/{appName}/functions/orders.ts`

#### Scenario: Draft 函数修改需 Reconcile 生效

- **WHEN** 开发者修改了 `apps/{appName}/functions/orders.ts` 的源码，但未执行 Reconcile
- **THEN** Draft 模式下请求该函数 SHALL 仍执行旧版本代码（来自 `draft/apps/{appName}/functions/orders.ts` 的副本）

#### Scenario: Reconcile 后 Draft 函数更新

- **WHEN** 开发者修改源码后执行 Reconcile
- **THEN** Reconcile 将新版本函数复制到 draft 目录，后续 Draft 模式请求 SHALL 执行新版本代码
