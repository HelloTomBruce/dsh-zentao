# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）数据。

- **1 个 `zentao` 薄代理工具**：story/bug/task/project/execution/product/my 等 20 个模块的列表/详情/创建/更新/删除/状态流转（0.3.1 CLI 起 bug 列表支持 product/project/execution 三选一范围，新增 my 地盘模块查“指派给我的”）
- **对话内表格卡片**：列表/详情在 Web 客户端渲染为原生表格（`tool.call.toolview`）
- **右侧栏 Tab 面板**：右侧侧边栏引导页【禅道概览】入口卡片（与“工作区文件”、“新建终端”、“工作区任务”并列，order 40），点击新开 Tab，按**当前工作区**的绑定配置展示该执行的任务与该范围的 Bug，面板内可直接登录禅道，支持分屏/全屏/拖拽

数据访问复用 `zentao` CLI（作为运行时依赖随插件安装，子进程调用），凭证由 CLI 内部管理。配置唯一来源是 dsh 用户目录下的 `zentao.json`（`$DSH_HOME/zentao.json`，默认 `~/.dsh/zentao.json`）：CLI 调用统一携带 `ZENTAO_CONFIG_FILE` 指向它，**登录在侧栏面板中完成**（凭证经 CLI 直接写入该文件）。配置不放在插件安装目录内——node_modules 会被 pnpm 更新/重装重建，dsh 用户目录不受影响，登录态跨重装、跨 profile 持久。

## 安装

```bash
# 安装插件
dsh plugin --profile <profile> add dsh-zentao
# 或本地开发：dsh plugin --profile <profile> add link:/path/to/dsh-zentao
```

安装后在右侧侧边栏引导页点【禅道概览】卡片，以新开 Tab 打开面板，在面板中填写服务地址 / 账号 / 密码（或 Token）完成登录。

## 工作区绑定（.dsh-zentao.json）

面板按**当前工作区**展示数据：在工作区根目录创建 `.dsh-zentao.json`，声明该工作区所属的禅道对象：

```json
{ "product": 2, "execution": 168, "project": 5 }
```

- `execution`：任务视图范围（task 列表必须按执行）
- `product`（或 `project` / `execution`）：Bug 视图范围，优先级 product > project > execution
- 三项均可选但至少其一；未配置时面板显示创建引导。ID 可在对话中用 zentao 工具查询（如 `zentao 模块=product 动作=list`）
- 面板按工作区独立缓存 60s；该文件可提交进仓库与团队共享，也可加入 .gitignore

## 工具用法

```text
zentao 模块=bug 动作=list product=2                  # 产品 #2 的 Bug 列表（也可 project=5 或 executionID=168）
zentao 模块=task 动作=list executionID=168           # 执行 #168 的任务
zentao 模块=my 动作=tasks                            # 指派给我的任务
zentao 模块=my 动作=bugs                             # 指派给我的 Bug
zentao 模块=bug 动作=get id=3395                     # Bug 详情
zentao 模块=bug 动作=create fields={title:..., severity:2, assignedTo:admin}
zentao 模块=bug 动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task 动作=start id=15317
```

范围参数：story/testcase → `product`；**bug → `product` / `project` / `executionID` 三选一**；epic/requirement/testtask/productplan/release/feedback/ticket/system → `productID`（模型侧仍传 `product`，插件自动映射）；execution/build → `project`；**task → `executionID`**（注意不是 execution）；`my` 模块无需范围参数。

## 已知局限

- 列表统一 `--recPerPage=200` 拉全量（`--filter` 与分页不兼容的 pitfall），大列表在模型侧按 status/assignedTo 过滤
- `bug resolve` 必须提供 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 面板任务/Bug 视图依赖工作区 `.dsh-zentao.json` 绑定；`my` 地盘模块需要禅道服务端 ≥ 22.5
- **会话内请用 zentao 工具而非直接运行 `zentao` CLI**：CLI 凭证（`$DSH_HOME/zentao.json`）在 dsh 会话的 Bash 沙箱中不可达，直接跑会报 E1005；插件工具走 node 宿主进程，不受沙箱影响

## 技术说明

- **CLI 作为运行时依赖**：`zentao-cli@0.3.1` 随插件安装（无需全局安装），插件以 `process.execPath` 直接执行其 bin 脚本，不依赖 PATH；配置固定为 dsh 用户目录的 `zentao.json`（`ZENTAO_CONFIG_FILE` 指向它），登录由面板发起、CLI 直接写入
- **工作区绑定**：面板读取当前工作区根目录的 `.dsh-zentao.json`（产品/执行/项目 ID），服务端据此构造 `task --executionID` / `bug --<scope>` 查询，按工作区分键缓存 60s
- **客户端 React external**：`lib/client.js`（CJS closure-factory）保持 react/react-dom 外部引用，由宿主注入
- **右侧栏 Tab 集成**：`dsh.client.inject` 声明 `@deepseek-ai/dsh-client-ui-sidebar-right`（运行时注入 `sidebarRight`/`sidebarRightTabs` 服务），本地 `ambient.d.ts` 补齐席位类型（本地 harness 源码暂无该包）
- **构建**：tsdown（node 侧 ESM + 客户端 CJS），`npm run verify` = typecheck + test + build

## 开发

```bash
npm run verify   # typecheck + test + build
```

## License

MIT
