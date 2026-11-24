import { defineTool } from "@deepseek-ai/dsh-tools";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runZentao } from "./lib/cli.js";
import { buildCliArgs, MODULES } from "./schema.js";
const DESCRIPTION = `Query or operate ZenTao (禅道) project data through the installed \`zentao\` CLI.

Usage: pick a \`module\` (story/bug/task/project/execution/product/my/...) and an \`action\`:
- list: fetch rows across all pages (pass the module's scope param, e.g. bug -> product, release -> product, task -> executionID)
- get <id>: fetch one object
- create: pass \`fields\` (e.g. title, assignedTo, pri; scope fields like product/executionID go in fields too — the plugin maps them to the right CLI flags)
- update <id>: pass changed \`fields\` only
- delete <id>
- status actions per module: bug -> activate/close/confirm/resolve; task -> activate/close/start/finish; story -> activate/close/change
- my module (assigned-to-me lists, no scope needed): action = tasks / bugs / stories / epics / requirements / todos / projects / testtasks / testcases / feedbacks / tickets / meetings / issues / risks

Special modules:
- file: get (attachment info) / read (download attachment to local disk; fields.saveTo sets the path, default .dsh-zentao/attachments/file-<id>; needs server 23.0+) / create (upload local file: fields={file, objectType, objectID}) / delete
- knowledge (AI 知识库, 22.7+): list (id = libID) / get / search (fields={keywords:[...], libIDs:[...]}) / embeddingsSearch (fields={keyword, libIDs:[...], minSimilarity?, limit?})
- doc (文档, 22.5+): action = mySpaces / teamSpaces / productSpaces / projectSpaces / myLibs / teamLibs / productLibs / projectLibs / myDocs / teamDocs / productDocs / projectDocs (fields.spaceID / fields.libID as required) / get <id>
- weekly (项目周报, 22.7+): list (project) / get / create / update / delete
- relation (对象关联, 22.7+): list / candidates — fields.objectType (e.g. "story") + id (objectID); candidates also needs fields.relatedObjectType (e.g. "task")

Scope params by module family:
- \`product\`: story / bug / testcase / epic / requirement / testtask / productplan / release / feedback / ticket / system
- \`project\`: execution / build
- \`executionID\`: task
- bug list also accepts \`project\` or \`executionID\` instead of \`product\` (any one)

Notes:
- bug resolve requires resolution + assignedTo + resolvedBuild + comment (server-enforced).
- Lists fetch ALL pages by default. Use query params to narrow: browseType (status), filter (conditions, comma = AND), search (keywords), sort (e.g. id:desc), maxItems (cap; result carries truncated + total when capped), pick (comma-separated field whitelist — STRONGLY recommended for large lists to save tokens, e.g. pick="id,title,status,assignedTo"), htmlToMarkdown (rich text -> Markdown).
- Field names in \`fields\` are camelCase API field names (e.g. realStarted, resolvedBuild); the plugin passes them through to the CLI as JSON.
- zentao-cli ships as a plugin runtime dependency (no global install needed); login must be done once beforehand (zentao login, credentials managed by the CLI)`;
export const ZENTAO_PARAMETERS = {
    module: {
        type: "string",
        required: true,
        enum: MODULES,
        description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file（附件，read 下载需服务端 23.0+）/knowledge（AI 知识库，22.7+）/doc（文档，22.5+）/weekly（项目周报，22.7+）/relation（对象关联，22.7+）/my（地盘，指派给我的，22.5+）",
    },
    action: {
        type: "string",
        required: true,
        enum: ["list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm", "start", "finish", "change", "read", "search", "candidates", "embeddingsSearch",
            "mySpaces", "teamSpaces", "productSpaces", "projectSpaces", "myLibs", "teamLibs", "productLibs", "projectLibs", "myDocs", "teamDocs", "productDocs", "projectDocs",
            "todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks"],
        description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/confirm/start/finish/change，按模块校验）；file 模块另有 read（下载附件到本地，fields.saveTo 指定路径）；knowledge 模块有 search/embeddingsSearch；relation 模块有 list/candidates；doc 模块动作即资源名（myDocs/productLibs…）；模块为 my 时动作即资源名（tasks/bugs/stories… 指派给我的）",
    },
    id: {
        type: "number",
        description: "对象 ID（get/update/delete/状态动作需要）。",
    },
    product: {
        type: "number",
        description: "产品 ID（列表范围参数）。story/bug/testcase/epic/requirement/testtask/productplan/release/feedback/ticket/system 的列表用此参数。",
    },
    project: {
        type: "number",
        description: "项目 ID（列表范围参数，execution/build 需要；bug 列表也可用它作范围）。",
    },
    executionID: {
        type: "number",
        description: "执行 ID（task 列表的范围参数；bug 列表也可用它作范围）。",
    },
    fields: {
        type: "object",
        description: "字段键值对（create/update/状态动作），camelCase API 字段名，如 { title, assignedTo, pri, severity }；数组字段直接给数组（如 bug 的 openedBuild: [\"trunk\"]）；create 时 scope 字段（product/executionID/project）也放这里，插件自动映射为对应 CLI flag。",
        additionalProperties: true,
    },
    maxItems: {
        type: "number",
        description: "最多返回条数（list/my 生效）；不给则 --all 拉全量。给定时结果带 truncated=true 表示截断（total 为全集条数）。",
    },
    browseType: {
        type: "string",
        description: "列表状态过滤（list/my 生效），取值随模块：task 默认 unclosed，还有 doing/done/all 等；bug 有 unclosed/unresolved/all 等。",
    },
    filter: {
        type: "string",
        description: "条件过滤表达式（list/my 生效，拉取范围内过滤），逗号分隔为 AND，如 status=active,pri=1。",
    },
    search: {
        type: "string",
        description: "关键词搜索（list/my 生效，拉取范围内），逗号分隔关键词为 AND。",
    },
    searchFields: {
        type: "string",
        description: "限定 search 的字段（list/my 生效，逗号分隔），缺省搜全部字段。",
    },
    sort: {
        type: "string",
        description: "排序（list/my 生效），如 id:desc、pri:asc。",
    },
    pick: {
        type: "string",
        description: "返回字段裁剪（list/my 生效，逗号分隔）——大列表先用它只拿需要的列（如 id,title,status,assignedTo），显著省 token。",
    },
    htmlToMarkdown: {
        type: "boolean",
        description: "把富文本字段（desc/steps 等）转为 Markdown（list/my 生效），默认 false 原样返回 HTML。",
    },
};
export function applyTools(ctx) {
    const disposers = [];
    disposers.push(ctx.systemPrompt.section({
        name: "tool:zentao",
        order: 130,
        text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish/confirm). For lists pass the module's scope param (story/testcase -> product; bug -> product or project or execution; task -> executionID; execution/build -> project); lists fetch all pages — narrow with query params: pick (field whitelist, saves tokens on big lists), browseType/filter/search/sort/maxItems, htmlToMarkdown. Result carries total/truncated when capped by maxItems. bug resolve needs resolution + assignedTo + resolvedBuild + comment. For assigned-to-me data use module=my (actions: tasks/bugs/stories/todos/projects/...). Requires zentao CLI installed and logged in.",
    }));
    disposers.push(ctx.tools.register(defineTool({
        name: "zentao",
        description: DESCRIPTION,
        parameters: ZENTAO_PARAMETERS,
        output: {
            schema: {
                type: "object",
                additionalProperties: true,
                properties: {
                    module: { type: "string", required: true },
                    action: { type: "string", required: true },
                    data: { type: "json", required: true },
                    count: { type: "number" },
                    total: { type: "number" },
                    truncated: { type: "boolean" },
                },
            },
            render: (_args, value) => [
                {
                    type: "text",
                    text: `zentao ${value.module} ${value.action}：${value.count ?? "—"} 条${value.truncated === true ? `（共 ${value.total ?? "?"} 条，已按 maxItems 截断）` : ""}。数据见卡片。`,
                },
            ],
            presentationMeta: (_args, value) => ({
                module: value.module,
                action: value.action,
                // 完整数据：meta 是仅供 UI bridge 的 presentation payload（不进模型上下文），
                // 客户端表格卡从 block.meta 重建列与行。
                data: value.data,
                count: value.count ?? 0,
                ...(value.total !== undefined ? { total: value.total } : {}),
                ...(value.truncated !== undefined ? { truncated: value.truncated } : {}),
            }),
        },
        isConcurrencySafe: () => false,
        async execute(args) {
            const zargs = args;
            // file read 落盘前确保目标目录存在（CLI 不会创建父目录）
            if (zargs.module === "file" && zargs.action === "read" && zargs.id !== undefined) {
                const saveTo = zargs.fields?.saveTo !== undefined ? String(zargs.fields.saveTo) : `.dsh-zentao/attachments/file-${zargs.id}`;
                mkdirSync(dirname(resolve(saveTo)), { recursive: true });
            }
            const result = await runZentao(buildCliArgs(zargs));
            const data = result.data;
            const meta = result.meta;
            const count = Array.isArray(data) ? data.length : data === undefined ? 0 : 1;
            const total = typeof meta?.total === "number" ? meta.total : undefined;
            const truncated = meta?.truncated === true || meta?.hasMore === true ? true : undefined;
            return {
                module: zargs.module,
                action: zargs.action,
                data,
                count,
                ...(total !== undefined ? { total } : {}),
                ...(truncated !== undefined ? { truncated } : {}),
            };
        },
        presentCall: (args) => ({
            card: "generic",
            title: `zentao ${args.module} ${args.action}${args.id !== undefined ? ` #${args.id}` : ""}`,
            kind: "other",
            rawInput: args,
        }),
        presentResult: (args, result) => result.isError
            ? undefined
            : { card: "generic", title: `zentao ${args.module} ${args.action}` },
    })));
    return () => {
        for (const dispose of disposers)
            dispose?.();
    };
}
//# sourceMappingURL=tools.js.map