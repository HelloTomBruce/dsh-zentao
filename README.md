# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）。对话中用 `zentao` 工具完成增删改查与状态流转，右侧栏【禅道概览】面板按当前工作区展示数据。

## 特性

- **`zentao` 工具（薄代理）**：24 个模块的 list / get / create / update / delete 与状态流转（bug resolve、task start/finish、story change 等），另接入 knowledge（AI 知识库）/ doc（文档）/ weekly（周报）/ relation（对象关联）与附件上传下载
- **查询参数**：`pick` 字段裁剪 / `browseType` 状态 / `filter` 条件 / `search` 关键词 / `sort` 排序 / `maxItems` 上限（结果带 total/truncated）/ `htmlToMarkdown` 富文本转 Markdown
- **对话内表格卡片**：工具结果在 Web 客户端渲染为原生表格
- **右侧栏面板**：任务 / Bug / 需求 / 测试单 / 用例 5 个视图，**面板内手动选择范围**（产品 / 项目→执行级联，未配置绑定也能直接用，选择按工作区记住；选中后收纳为单行摘要，点「修改」在弹窗内调整），状态 / 优先级 / 关键词筛选（Bug 另有严重程度）、分页、仅指派给我、类型化详情与图片渲染（测试单除外）、未关闭 Bug 计数徽标；面板内可直接登录，支持分屏 / 全屏 / 拖拽

## 安装

```bash
dsh plugin --profile <profile> add dsh-zentao
# 本地开发：dsh plugin --profile <profile> add link:/path/to/dsh-zentao
```

装好后点右侧栏引导页【禅道概览】卡片打开面板，填写服务地址 / 账号 / 密码（或 Token）完成登录。凭证由 CLI 写入 `~/.dsh/zentao.json`（`$DSH_HOME/zentao.json`），插件不接触凭证，登录态跨插件重装、跨 profile 持久。

## 工作区绑定

面板按当前工作区取数。**最快的用法是不配置**：面板顶部的范围选择器直接选产品 / 项目→执行（选择按工作区记忆在浏览器 localStorage，显式选择优先于文件绑定；需求 / 测试单 / 用例视图仅响应产品选择）。

需要团队共享固定范围时，在工作区根目录创建 `.dsh-zentao.json`（可提交共享，也可 gitignore），显式选择未覆盖的维度回落到它：

```json
{ "product": 2, "execution": 168, "executions": [168, 172] }
```

- 任务视图 → `execution`；`executions` 数组绑多个执行（未写 `execution` 时取首项为默认）
- Bug 视图 → `product` / `project` / `execution` 三选一（优先级同序）
- 需求 / 测试单 / 用例视图 → `product`
- 至少配置其一；ID 可用工具查（如 `zentao 模块=product 动作=list`）

## 工具用法

```text
zentao 模块=bug   动作=list    product=2 pick="id,title,status,assignedTo"   # 列表 + 字段裁剪
zentao 模块=task  动作=list    executionID=168 maxItems=50
zentao 模块=my    动作=tasks                                                 # 指派给我
zentao 模块=bug   动作=get     id=3395                                       # 详情
zentao 模块=bug   动作=create  fields={product:2, title:..., severity:2, openedBuild:["trunk"]}
zentao 模块=story 动作=create  fields={product:2, title:..., pri:3, spec:"<p>描述 HTML</p>"}
zentao 模块=bug   动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task  动作=start   id=15317 fields={realStarted:2026-11-24}
```

范围参数：story/testcase/epic/requirement/testtask/productplan/release/feedback/ticket/system → `product`；**bug → product / project / executionID 三选一**；execution/build → `project`；**task → `executionID`**；`my` 无需范围。

## 注意

- 服务端版本：`my` ≥ 22.5，knowledge / weekly / relation ≥ 22.7，附件下载 ≥ 23.0（低版本由 CLI 明确报错）
- `bug resolve` 必须带 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 需求（story/requirement/epic）create/change 的评审规则随产品配置：无有效 reviewer 时直接 active（显式 `status: "draft"` 保留草稿），有 reviewer 则固定 reviewing
- 写入富文本（desc / spec / steps / verify）需给 HTML：`htmlToMarkdown` 仅对列表读取生效
- 会话内请用 zentao 工具而非直接运行 CLI：凭证在 Bash 沙箱不可达，直跑报 1006；插件工具走宿主进程不受影响

## 开发

```bash
npm run verify   # typecheck + test + build
```

- **数据链路**：`zentao-cli@0.5.0` 为运行时依赖（无需全局安装），插件以子进程执行其 bin、不依赖 PATH；写操作字段经 `--data` JSON 透传，create 的 scope 字段按模块映射为独立 flag
- **link 开发**：`node scripts/link-host-packages.mjs` 软链宿主 `@deepseek-ai/*` 包——npm install 会清除软链，装完依赖需重跑；typecheck / vitest 经 tsconfig paths 与 alias 解析宿主树
- **客户端**：tsdown 构建为 CJS，react/react-dom 由宿主注入；详情富文本经 DOMPurify 白名单消毒后渲染（src/client/sanitize.ts），面板端点均做本机来源校验
- **架构**：src/views.ts 视图 registry 单源（server + client 共享），面板按视图懒加载，服务端按工作区+视图+执行+筛选缓存 60s；`lib/` 不入库，git 安装由 prepare 钩子自动构建

## License

MIT
