# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）数据。

- **1 个 `zentao` 薄代理工具**：story/bug/task/project/execution/product/my 等 24 个模块的列表/详情/创建/更新/删除/状态流转，另接入 knowledge（AI 知识库搜索）/ doc（文档）/ weekly（项目周报）/ relation（对象关联）与附件上传下载
- **查询能力**：列表默认拉取全部页；`browseType` 状态 / `filter` 条件 / `search` 关键词 / `sort` 排序 / `pick` 字段裁剪 / `maxItems` 上限（结果带 `total`/`truncated` 完整性标记）/ `htmlToMarkdown` 富文本转换
- **对话内表格卡片**：列表/详情在 Web 客户端渲染为原生表格（`tool.call.toolview`）
- **右侧栏 Tab 面板**：右侧侧边栏引导页【禅道概览】入口卡片（与“工作区文件”、“新建终端”、“工作区任务”并列，order 40），点击新开 Tab，按**当前工作区**的绑定配置展示该执行的任务与该范围的 Bug，支持状态筛选（未关闭/进行中/已完成…）、分页、仅指派给我、详情查看与图片渲染；面板内可直接登录禅道，支持分屏/全屏/拖拽

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
zentao 模块=bug 动作=create fields={product:2, title:..., severity:2, openedBuild:["trunk"]}
zentao 模块=bug 动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task 动作=start id=15317 fields={realStarted:2026-11-24}
```

列表查询参数（list 与 my 地盘动作生效）：

```text
pick="id,title,status,assignedTo"    # 字段裁剪——大列表先裁剪，显著省 token
browseType=unclosed                  # 状态过滤（取值随模块）
filter="status=active,pri=1"         # 条件过滤，逗号分隔为 AND
search="登录"                        # 关键词搜索（searchFields 可限定字段）
sort="id:desc"                       # 排序
maxItems=50                          # 条数上限；结果带 truncated/total 标记截断与全集大小
htmlToMarkdown=true                  # 富文本字段（desc/steps）转 Markdown
```

范围参数：story/testcase/epic/requirement/testtask/productplan/release/feedback/ticket/system → `product`；**bug → `product` / `project` / `executionID` 三选一**；execution/build → `project`；**task → `executionID`**；`my` 模块无需范围参数。

## 已知局限

- `bug resolve` 必须提供 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 面板任务/Bug 视图依赖工作区 `.dsh-zentao.json` 绑定；`my` 地盘模块需要禅道服务端 ≥ 22.5；knowledge/weekly/relation 需 ≥ 22.7；附件下载（file read）需 ≥ 23.0——低版本服务端由 CLI 自检并给出明确报错
- **会话内请用 zentao 工具而非直接运行 `zentao` CLI**：CLI 凭证（`$DSH_HOME/zentao.json`）在 dsh 会话的 Bash 沙箱中不可达，直接跑会报 1006；插件工具走 node 宿主进程，不受沙箱影响

## 技术说明

- **CLI 作为运行时依赖**：`zentao-cli@0.5.0` 随插件安装（无需全局安装），插件以 `process.execPath` 直接执行其 bin 脚本，不依赖 PATH；配置固定为 dsh 用户目录的 `zentao.json`（`ZENTAO_CONFIG_FILE` 指向它），登录由面板发起、CLI 直接写入
- **0.5.0 命令面适配**：显式 `list`/`get` 子命令；列表 `--all` 遍历全部页；写操作字段经 `--data` JSON 透传（camelCase 原样保留，数组字段如 `openedBuild` 直接给数组）；create 的 scope 字段（product/executionID/project）按模块映射为独立 flag（`--product-id` / `--product` / `--execution-id`，各模块异构）
- **工作区绑定**：面板读取当前工作区根目录的 `.dsh-zentao.json`（产品/执行/项目 ID），服务端据此构造 `task list --execution-id` / `bug list --<scope>` 查询并用 `--fields` 裁剪到面板列；按工作区+筛选条件分键缓存 60s
- **测试宿主包解析**：`@deepseek-ai/*` 不在 npm 依赖中——typecheck 走 tsconfig paths（兄弟仓库 `../deepseek-harness`），vitest 走 vitest.config.ts 的同名 alias（勿手工软链进 node_modules，会被 npm install 当 extraneous 清除）
- **客户端 React external**：`lib/client.js`（CJS closure-factory）保持 react/react-dom 外部引用，由宿主注入
- **右侧栏 Tab 集成**：`dsh.client.inject` 声明 `@deepseek-ai/dsh-client-ui-sidebar-right`（运行时注入 `sidebarRight`/`sidebarRightTabs` 服务），本地 `ambient.d.ts` 补齐席位类型（本地 harness 源码暂无该包）
- **构建**：tsdown（node 侧 ESM + 客户端 CJS），`npm run verify` = typecheck + test + build

## 开发

```bash
npm run verify   # typecheck + test + build
```

## License

MIT
