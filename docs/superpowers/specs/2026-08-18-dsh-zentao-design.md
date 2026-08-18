# dsh-zentao 插件设计

- 日期：2026-08-18
- 状态：已批准（用户确认全部设计决策）

## 概述

一个发布到 GitHub 的 dsh/Cordis 插件，让 dsh 会话能查询和操作禅道（ZenTao）数据，并在 Web 客户端提供**对话内表格卡片**和**侧栏底部原生面板**两种呈现。核心定位是"CLI 的薄代理"：数据访问复用用户已安装的 `zentao` CLI，插件不实现任何禅道 API 逻辑，也不接触凭证。

## 已确认决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 形态 | D：工具集 + 对话内表格卡片 + 原生面板（**不做统计图表**，表格是核心） |
| 2 | 数据访问 | 子进程调用已安装的 `zentao` CLI（非直连 API） |
| 3 | 认证 | 完全交给 CLI 内部管理（用户 `zentao login` 一次，凭证在 `~/.config/zentao/zentao.json`），插件不读凭证、不存密码 |
| 4 | 工具粒度 | **1 个大工具 `zentao`**，参数镜像 CLI 语法，薄代理 |
| 5 | 表格呈现 | Web 客户端 `tool.call.toolview` 工具卡渲染原生表格（复用 dsh-viz-echarts 验证的路线） |
| 6 | 面板位置 | `sidebar.footer.action`（list/root 插槽，当前空闲）侧栏底部 Settings 上方图标，点击弹出面板 |
| 7 | 面板内容 | 我的任务 / 指派给我的 Bug / 进行中的项目，三个视图 |
| 8 | 发布 | GitHub 仓库，`dsh plugin add` 可装；前置要求 `npm i -g zentao-cli && zentao login` |

## 架构

```
┌─ Node 侧（dsh 运行时）────────────────────────────────┐
│  zentao 工具（1 个薄代理）── child_process ──► zentao CLI
│  /zentao/* 数据端点（webServer，喂面板数据）            │
└───────────────────────────────────────────────────────┘
        │ tool/call 事件（arguments + result）     │ fetch /zentao/overview
        ▼                                           ▼
┌─ Web 客户端 ─────────────────────────────────────┐
│  ① tool.call.toolview 表格卡（对话内）            │
│  ② sidebar.footer.action 图标 → 弹出面板          │
└──────────────────────────────────────────────────┘
```

### Node 侧

#### `zentao` 工具（薄代理）

- 名称：`zentao`
- 注入：`tools`、`systemPrompt`
- 参数：
  - `module`：枚举白名单（program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/build/release/feedback/ticket/system/user/file）
  - `action`：list / get / create / update / delete / activate / close / resolve / start / finish / change /（按 module 校验合法动作组合）
  - `id`：get/update/delete/action 需要
  - 范围参数：`product` / `project` / `execution`（list 时按 module 需要）
  - 字段参数：`fields`（object，`additionalProperties: true`，键值对透传为 `--key=value`，create/update/action 用）
  - `format`：固定 JSON，内部 `--format=json`
- 执行：`execFile('zentao', [module, ...args, '--format=json'])`，解析 `{status, data}` 返回结构化 JSON
- 错误处理：
  - CLI 不存在 → `请先安装：npm i -g zentao-cli`
  - E1001/E1004（未登录/Token 失效）→ `请先登录：zentao login`
  - 其它 CLI 错误码透传 CLI 的 message
- 已知 pitfall 内置规避（来自 zentao-cli 技能）：
  - list 统一 `--recPerPage=200` 拉全量，不用 `--filter` 配合分页
  - resolve 必须提供 resolution + assignedTo + resolvedBuild + comment 四字段（服务端硬性要求，工具 schema 标注必填）

#### `/zentao/overview` 数据端点

- 挂载到 `webServer`（同源），供客户端面板 fetch
- 内部聚合三次 CLI 调用：`task --assignedTo=me`、`bug --assignedTo=me`、`project --status=doing`（或等价查询）
- 返回 JSON：`{ myTasks, myBugs, activeProjects }`
- 错误时返回结构化错误（含未登录状态标记），面板据此显示"去登录"引导

### Web 客户端

#### ① 表格工具卡（`tool.call.toolview`）

- 注册 keyed seat 给 `zentao` 工具调用
- 从工具调用的 result（结构化 JSON）渲染原生表格：列自适应、状态徽标着色（active/doing/closed）、空态文案
- 复用 dsh-viz-echarts 验证的 toolview 卡片路线（live + replay 都从持久化的 tool/call 事件恢复，无自定义 session 事件）
- 单条详情（get）渲染为字段列表/键值卡片，不硬套表格

#### ② 侧栏底部面板（`sidebar.footer.action`）

- 注册 list/root 插槽（当前空闲可占），owner props 只有 `wide`（宽栏显示文字行 + 图标，窄 rail 只显示图标）
- 点击弹出 React 面板（覆盖层），三个 tab/区块：
  - 我的任务：任务名、执行、状态、截止
  - 我的 Bug：标题、严重级、优先级、状态
  - 进行中的项目：名称、状态、起止
- 数据源：fetch `/zentao/overview`；loading / 失败 / 未登录 三态
- 打开时拉取，可手动刷新

## 错误处理总则

| 场景 | 工具表现 | 面板表现 |
|------|---------|---------|
| CLI 未安装 | 报错提示安装命令 | 面板显示安装引导 |
| 未登录/Token 失效 | 报错提示 `zentao login` | 面板显示"去登录"引导 |
| 超时 | 报错（透传 CLI 超时） | loading → 失败态 + 重试 |
| 禅道服务不可达 | 透传 CLI 错误 | 失败态 + 重试 |

## 发布与安装

- `cordis.patch.yml`：注册 `zentao` 插件行（`name: dsh-zentao`）
- `package.json`：
  - `dsh.bundle.patch` 指向 cordis.patch.yml
  - `dsh.client.inject` 声明客户端依赖（`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-tool`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-conversation` 等）
  - `dsh.client.platform: web`
- 运行时依赖：**零 npm 依赖**（只调 CLI 子进程）；devDependencies：typescript、tsdown、@types/node、react、@types/react
- README：安装、登录前置、工具用法示例、pitfall 说明、与 dsh-viz-echarts 关系（无依赖）

## 范围外（明确不做）

- 不实现统计图表/可视化（表格是核心；如需图表用户可搭配 dsh-viz-echarts 手动构图）
- 不做 CLI 凭证管理、不读取 `~/.config/zentao/zentao.json`
- 不实现禅道 API 直连层
- 不做批量/跨产品聚合查询（CLI 已知局限，按需再议）
