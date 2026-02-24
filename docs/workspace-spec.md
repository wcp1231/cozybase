# Workspace 规范

## 目录约定

```
my-workspace/                     # cozybase 绑定的 workspace 根目录
├── todo-app/                     # 目录名 = App 名称
│   ├── app.yaml                  # [必须] App 标识和元数据
│   ├── tables/                   # 每个 .yaml 文件 = 一张数据库表
│   │   ├── todos.yaml
│   │   └── users.yaml
│   ├── functions/                # 每个 .ts 文件 = 一个可调用函数 (计划中)
│   │   └── send-email.ts
│   ├── crons.yaml                # 定时任务声明 (计划中)
│   ├── storage.yaml              # 存储桶声明 (计划中)
│   └── ui/                       # 静态 UI 文件 (计划中)
├── blog-app/
│   ├── app.yaml
│   └── tables/
│       └── posts.yaml
└── .gitignore
```

## 命名规则

| 资源 | 规则 | 示例 |
|------|------|------|
| App 名称 | `[a-zA-Z0-9_-]+`，由目录名决定 | `todo-app`, `blog_v2` |
| 表名 | 文件名去掉 `.yaml` 后缀，需匹配 `[a-zA-Z_][a-zA-Z0-9_]*` | `todos.yaml` → 表 `todos` |
| 列名 | `[a-zA-Z_][a-zA-Z0-9_]*` | `user_id`, `created_at` |
| 函数名 | 文件名去掉 `.ts` 后缀 | `send-email.ts` → 函数 `send-email` |

## App 发现规则

1. 扫描 workspace 根目录下的所有子目录
2. 跳过以 `.` 开头的目录
3. 跳过名称不匹配 `[a-zA-Z0-9_-]+` 的目录
4. 只有包含 `app.yaml` 文件的目录才被识别为 App
5. 没有 `app.yaml` 的目录被忽略

## YAML 格式

### app.yaml

App 的入口文件。存在即标识这是一个 App，内容可以为空。

```yaml
# 最小形式：空文件即可

# 完整形式：
description: "A simple todo application"
```

字段说明：

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `description` | string | 否 | App 描述，显示在 status API |

Schema 使用 `passthrough()`，支持任意自定义字段（不会报错，但当前版本不处理）。

### tables/*.yaml

每个 YAML 文件声明一张表的结构。

```yaml
columns:
  - name: id
    type: text
    primary_key: true
  - name: title
    type: text
    required: true
  - name: email
    type: text
    unique: true
  - name: score
    type: integer
    default: "0"
  - name: user_id
    type: text
    references: users(id)
  - name: created_at
    type: text
    default: "(datetime('now'))"

indexes:
  - columns: [user_id]
  - columns: [score, created_at]
    unique: false
    name: idx_custom_name
```

#### columns 字段

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 列名，需匹配 `[a-zA-Z_][a-zA-Z0-9_]*` |
| `type` | enum | 是 | `text` \| `integer` \| `real` \| `blob` \| `numeric` |
| `primary_key` | boolean | 否 | 主键，通常用于 `id` 列 |
| `required` | boolean | 否 | 生成 `NOT NULL` 约束 |
| `unique` | boolean | 否 | 生成 `UNIQUE` 约束 |
| `default` | string | 否 | 默认值，需带引号写 SQL 表达式 |
| `references` | string | 否 | 外键引用，格式 `table(column)` |

`columns` 数组至少包含一个元素。

#### indexes 字段

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `columns` | string[] | 是 | 索引涉及的列名，至少一列 |
| `unique` | boolean | 否 | 是否唯一索引 |
| `name` | string | 否 | 自定义索引名。默认为 `idx_{表名}_{列名1}_{列名2}` |

#### 类型映射

YAML 中的 `type` 值直接对应 SQLite 类型亲和性：

| YAML type | SQLite type | 说明 |
|-----------|-------------|------|
| `text` | TEXT | 字符串，也用于存储日期时间 |
| `integer` | INTEGER | 整数，也用于布尔 (0/1) |
| `real` | REAL | 浮点数 |
| `blob` | BLOB | 二进制数据 |
| `numeric` | NUMERIC | 数值（SQLite 会自动选择存储类型） |

#### default 值写法

default 值以 SQL 表达式形式传入，需注意引号：

```yaml
# 数字默认值
default: "0"
default: "100"

# SQL 函数 (需要括号包裹)
default: "(datetime('now'))"
default: "(random())"

# 字符串默认值 (需要单引号)
default: "'pending'"

# NULL
default: "NULL"
```

### crons.yaml (计划中)

```yaml
jobs:
  - name: cleanup-old-todos
    schedule: "0 3 * * *"       # cron 表达式
    function: cleanup-todos     # 调用的函数名
    payload:                    # 传入函数的参数
      days_old: 30
```

### storage.yaml (计划中)

```yaml
buckets:
  - name: avatars
    public: true                # 是否公开访问
    max_file_size: 5242880      # 最大文件大小 (bytes)
  - name: attachments
    public: false
    max_file_size: 52428800
```

### functions/*.ts (计划中)

函数是 TypeScript 源文件，通过 Bun Worker 执行：

```typescript
// functions/send-email.ts
self.onmessage = async (event) => {
  const { to, subject, body } = event.data;
  // 执行逻辑...
  self.postMessage({ success: true });
};
```

## 文件变更检测

Cozybase 使用文件内容的 SHA256 哈希值追踪变更：

1. 每次 reconcile 时，计算每个 spec 文件的 SHA256
2. 与 `resource_state` 表中存储的上次 hash 对比
3. hash 相同 → 跳过（无变更）
4. hash 不同 → 执行 diff + migrate
5. 更新 `resource_state` 中的 hash

这保证了：
- **幂等性**：重启 daemon 不会重复执行 DDL
- **最小变更**：只处理实际变化的文件
- **跨重启一致性**：hash 持久化在 platform DB 中
