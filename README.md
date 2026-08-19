# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）数据。

- **1 个 `zentao` 薄代理工具**：story/bug/task/project/execution/product 等 19 个模块的列表/详情/创建/更新/删除/状态流转
- **对话内表格卡片**：列表/详情在 Web 客户端渲染为原生表格（`tool.call.toolview`）
- **侧栏底部面板**：我的任务 / 我的 Bug / 进行中项目（`sidebar.footer.action`），面板内可直接登录禅道

数据访问复用 `zentao` CLI（作为运行时依赖随插件安装，子进程调用），凭证由 CLI 内部管理。配置唯一来源是 dsh 用户目录下的 `zentao.json`（`$DSH_HOME/zentao.json`，默认 `~/.dsh/zentao.json`）：CLI 调用统一携带 `ZENTAO_CONFIG_FILE` 指向它，**登录在侧栏面板中完成**（凭证经 CLI 直接写入该文件）。配置不放在插件安装目录内——node_modules 会被 pnpm 更新/重装重建，dsh 用户目录不受影响，登录态跨重装、跨 profile 持久。

## 安装

```bash
# 安装插件
dsh plugin --profile <profile> add dsh-zentao
# 或本地开发：dsh plugin --profile <profile> add link:/path/to/dsh-zentao
```

安装后在侧栏底部点“禅道”，在弹出的面板中填写服务地址 / 账号 / 密码（或 Token）完成登录。

## 工具用法

```text
zentao 模块=bug 动作=list product=2                  # 产品 #2 的 Bug 列表
zentao 模块=task 动作=list executionID=168           # 执行 #168 的任务
zentao 模块=bug 动作=get id=3395                     # Bug 详情
zentao 模块=bug 动作=create fields={title:..., severity:2, assignedTo:admin}
zentao 模块=bug 动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task 动作=start id=15317
```

范围参数：story/bug/testcase → `product`；epic/requirement/testtask/productplan/release/feedback/ticket/system → `productID`（模型侧仍传 `product`，插件自动映射）；execution/build → `project`；**task → `executionID`**（注意不是 execution）。

## 已知局限

- 列表统一 `--recPerPage=200` 拉全量（`--filter` 与分页不兼容的 pitfall），大列表在模型侧按 status/assignedTo 过滤
- `bug resolve` 必须提供 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 禅道无“我的任务”全局入口（task 列表必须按 execution），面板“我的任务”默认空，可改用 `zentao task list executionID=<id>` 查询
- 面板 Bug 视图按产品逐一遍历（产品数多时较慢）
- **会话内请用 zentao 工具而非直接运行 `zentao` CLI**：CLI 凭证（`~/.config/zentao/zentao.json`）在 dsh 会话的 Bash 沙箱中不可达，直接跑会报 E1005；插件工具走 node 宿主进程，不受沙箱影响

## 技术说明

- **CLI 作为运行时依赖**：`zentao-cli` 随插件安装（无需全局安装），插件以 `process.execPath` 直接执行其 bin 脚本，不依赖 PATH；配置固定为 dsh 用户目录的 `zentao.json`（`ZENTAO_CONFIG_FILE` 指向它），登录由面板发起、CLI 直接写入
- **客户端 React external**：`lib/client.js`（CJS closure-factory）保持 react/react-dom 外部引用，由宿主注入
- **构建**：tsdown（node 侧 ESM + 客户端 CJS），`npm run verify` = typecheck + test + build

## 开发

```bash
npm run verify   # typecheck + test + build
```

## License

MIT
