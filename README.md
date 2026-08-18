# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）数据。

- **1 个 `zentao` 薄代理工具**：story/bug/task/project/execution/product 等 20 个模块的列表/详情/创建/更新/删除/状态流转
- **对话内表格卡片**：列表/详情在 Web 客户端渲染为原生表格（`tool.call.toolview`）
- **侧栏底部面板**：我的任务 / 我的 Bug / 进行中项目（`sidebar.footer.action`）

数据访问复用 `zentao` CLI（子进程调用），凭证由 CLI 内部管理，**插件不读取、不存储任何凭证**。

## 安装

```bash
# 1. 安装并登录 zentao CLI（一次性）
npm i -g zentao-cli
zentao login

# 2. 安装插件
dsh plugin --profile <profile> add dsh-zentao
# 或本地开发：dsh plugin --profile <profile> add link:/path/to/dsh-zentao
```

## 工具用法

```text
zentao 模块=bug 动作=list product=2                  # 产品 #2 的 Bug 列表
zentao 模块=task 动作=list executionID=168           # 执行 #168 的任务
zentao 模块=bug 动作=get id=3395                     # Bug 详情
zentao 模块=bug 动作=create fields={title:..., severity:2, assignedTo:admin}
zentao 模块=bug 动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task 动作=start id=15317
```

范围参数：story/bug/release/feedback/ticket → `product`；execution/build → `project`；**task → `executionID`**（注意不是 execution）。

## 已知局限

- 列表统一 `--recPerPage=200` 拉全量（`--filter` 与分页不兼容的 pitfall），大列表在模型侧按 status/assignedTo 过滤
- `bug resolve` 必须提供 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 禅道无"我的任务"全局入口（task 列表必须按 execution），面板"我的任务"默认空，可改用 `zentao task list executionID=<id>` 查询
- 面板 Bug 视图按产品逐一遍历（产品数多时较慢）

## 开发

```bash
npm run verify   # typecheck + test + build
```

## License

MIT
