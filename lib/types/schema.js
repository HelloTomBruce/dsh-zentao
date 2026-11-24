/**
 * zentao 工具的模块/动作白名单与 CLI 参数构造（适配 zentao-cli ≥ 0.5.0：
 * - 列表/详情必须显式子命令：`bug list` / `bug get <id>`（0.3.x 的默认动作已移除）
 * - `--recPerPage=200` 已移除，列表统一 `--all` 显式遍历全部页面
 * - task 列表 scope 为 `--execution-id`（kebab-case）
 * - 写操作字段经 `--data <json>` 透传（camelCase 字段名原样保留，CLI 按
 *   schema 校验类型）；scope 字段（product/executionID…）不是请求体字段，
 *   create 时按模块映射为 `--product-id` / `--execution-id` 等独立 flag
 * - file create 走 multipart formdata 不支持 JSON，字段转 kebab-case flag
 */
const set = (...xs) => new Set(xs);
export const MODULE_INFO = {
    program: { label: "项目集", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
    product: { label: "产品", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
    project: { label: "项目", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
    // 0.5.0 execution list 无 scope flag；提供 project 时经 --filter 在拉取结果内过滤
    execution: { label: "执行", scopeFlags: [], scopeOptional: true, createScope: { project: "--project" }, actions: set("list", "get", "create", "update", "delete") },
    story: { label: "需求", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
    epic: { label: "业务需求", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
    requirement: { label: "用户需求", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
    // bug list 范围三选一（--product/--project/--execution 为 0.5.0 保留的别名）
    bug: { label: "Bug", scopeFlags: ["--product", "--project", "--execution"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm") },
    task: { label: "任务", scopeFlags: ["--execution-id"], createScope: { executionID: "--execution-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish") },
    testcase: { label: "测试用例", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
    testtask: { label: "测试单", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
    productplan: { label: "产品计划", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
    // build create 要求 --execution-id 与 --product 双 scope
    build: { label: "版本", scopeFlags: ["--project"], createScope: { executionID: "--execution-id", product: "--product" }, actions: set("list", "get", "create", "update", "delete") },
    release: { label: "发布", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
    feedback: { label: "反馈", scopeFlags: ["--product"], createScope: { product: "--product" }, actions: set("list", "get", "create", "update", "delete", "activate", "close") },
    ticket: { label: "工单", scopeFlags: ["--product"], createScope: { product: "--product" }, actions: set("list", "get", "create", "update", "delete", "activate", "close") },
    system: { label: "应用", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
    user: { label: "用户", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
    // file create 为 multipart formdata（不支持 --data JSON），字段转 kebab flag
    file: { label: "附件", scopeFlags: [], actions: set("create", "delete") },
    // 地盘模块：动作即资源名（zentao my tasks），列表式，无需 id 与范围参数
    my: { label: "地盘（指派给我的）", scopeFlags: [], actions: set("todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks") },
};
export const MODULES = Object.keys(MODULE_INFO);
/** resolve 隐含必填 4 字段（服务端硬性要求，缺一个报 2003）。 */
const RESOLVE_REQUIRED = ["resolution", "assignedTo", "resolvedBuild", "comment"];
/**
 * 从入参解析首个已提供的范围参数（--execution 与 --execution-id 均读
 * executionID 入参；返回 flag+value 供拼 CLI 参数）。
 */
function scopeValueOf(args, flags) {
    for (const flag of flags) {
        const value = flag === "--product" ? args.product
            : flag === "--project" ? args.project
                : flag === "--execution" || flag === "--execution-id" ? args.executionID
                    : undefined;
        if (value !== undefined)
            return { flag, value };
    }
    return undefined;
}
/** camelCase 字段名转 CLI 的 kebab-case flag 名（realStarted → real-started，objectID → object-id）。 */
function kebab(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}
/** file 模块专用：fields → kebab-case flag 列表（multipart formdata 不支持 --data）。 */
function flagArgs(fields) {
    if (fields === undefined)
        return [];
    return Object.entries(fields).map(([k, v]) => `--${kebab(k)}=${String(v)}`);
}
/** 非 scope 字段经 --data JSON 透传（camelCase 原样保留，CLI 按 schema 校验）。 */
function dataArgs(fields) {
    if (fields === undefined || Object.keys(fields).length === 0)
        return [];
    return ["--data", JSON.stringify(fields)];
}
/** 列表查询参数（browseType/filter/search/sort/pick/maxItems/htmlToMarkdown）→ CLI flags。filterOverride 用于合并后的过滤表达式（如 execution 的 project scope）。 */
function queryArgs(args, filterOverride) {
    const filter = filterOverride ?? args.filter;
    const out = [];
    if (args.browseType !== undefined)
        out.push(`--browse-type=${args.browseType}`);
    if (filter !== undefined)
        out.push(`--filter=${filter}`);
    if (args.search !== undefined)
        out.push(`--search=${args.search}`);
    if (args.searchFields !== undefined)
        out.push(`--search-fields=${args.searchFields}`);
    if (args.sort !== undefined)
        out.push(`--sort=${args.sort}`);
    if (args.pick !== undefined)
        out.push(`--fields=${args.pick}`);
    if (args.maxItems !== undefined)
        out.push(`--max-items=${args.maxItems}`);
    if (args.htmlToMarkdown === true)
        out.push("--html-to-markdown");
    return out;
}
/** 是否携带了仅列表可用的查询参数（用于非 list 动作的误用拦截）。 */
function hasQueryArgs(args) {
    return args.browseType !== undefined || args.filter !== undefined || args.search !== undefined
        || args.searchFields !== undefined || args.sort !== undefined || args.pick !== undefined
        || args.maxItems !== undefined || args.htmlToMarkdown !== undefined;
}
/**
 * create 参数构造：fields 中的 scope 字段（按模块 createScope 映射表）提为
 * 独立 flag，其余经 --data 透传。模型在 fields 里写 execution 或 executionID
 * 均可（统一归一为 executionID 查表）。
 */
function createArgs(info, fields) {
    const scopeMap = info.createScope ?? {};
    const scopeArgs = [];
    const rest = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
        const flag = scopeMap[k] ?? (k === "execution" ? scopeMap.executionID : undefined);
        if (flag !== undefined)
            scopeArgs.push(`${flag}=${String(v)}`);
        else
            rest[k] = v;
    }
    return [...scopeArgs, ...dataArgs(rest)];
}
/**
 * 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
 * 校验失败抛 Error（message 面向模型，含中文提示）。
 */
export function buildCliArgs(args) {
    const info = MODULE_INFO[args.module];
    if (info === undefined) {
        throw new Error(`未知模块 ${String(args.module)}，可选：${MODULES.join("/")}`);
    }
    const { module, action, id, fields } = args;
    if (!info.actions.has(action)) {
        throw new Error(`${info.label}(${module}) 不支持动作 ${action}，可选：${[...info.actions].join("/")}`);
    }
    // 查询参数仅 list/地盘动作生效，防止误写到 get/create 等动作上被静默忽略
    if (action !== "list" && module !== "my" && hasQueryArgs(args)) {
        throw new Error(`browseType/filter/search/searchFields/sort/pick/maxItems/htmlToMarkdown 仅在 list 或 my 地盘动作上生效（当前 ${action}）`);
    }
    // 地盘模块：动作即资源名（zentao my tasks），列表式，无需 id 与范围参数。
    if (module === "my") {
        return [module, action, ...queryArgs(args), "--all"];
    }
    if (action === "list") {
        const listArgs = [module, "list"];
        let filter = args.filter;
        if (module === "execution") {
            // 0.5.0 execution list 无 scope flag；提供 project 时并入 --filter（与显式 filter 逗号 AND 合并，
            // 避免两个 --filter 被 CLI 按 OR 处理）在拉取结果内过滤
            if (args.project !== undefined) {
                filter = filter === undefined ? `project=${args.project}` : `project=${args.project},${filter}`;
            }
        }
        else if (info.scopeFlags.length > 0) {
            const provided = scopeValueOf(args, info.scopeFlags);
            if (provided === undefined && info.scopeOptional !== true) {
                throw new Error(`${info.label}(${module}) 列表需要 ${info.scopeFlags.map((f) => f.replace(/^--/, "")).join(" / ")} 参数`);
            }
            if (provided !== undefined)
                listArgs.push(`${provided.flag}=${provided.value}`);
        }
        listArgs.push(...(filter === args.filter ? queryArgs(args) : queryArgs(args, filter)), "--all");
        return listArgs;
    }
    if (action === "get") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) get 需要 id`);
        return [module, "get", String(id)];
    }
    if (action === "create") {
        // file create 为 multipart formdata（不支持 JSON），字段走 kebab flag
        if (module === "file")
            return [module, "create", ...flagArgs(fields)];
        return [module, "create", ...createArgs(info, fields)];
    }
    if (action === "update") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) update 需要 id`);
        return [module, "update", String(id), ...dataArgs(fields)];
    }
    if (action === "delete") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) delete 需要 id`);
        return [module, "delete", String(id), "--yes"];
    }
    // 状态流转动作（activate/close/resolve/start/finish/change/confirm）：字段经 --data 透传
    if (action === "resolve") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) resolve 需要 id`);
        const missing = RESOLVE_REQUIRED.filter((k) => fields?.[k] === undefined);
        if (missing.length > 0) {
            throw new Error(`bug resolve 必须提供 ${missing.join("、")}（resolution/assignedTo/resolvedBuild/comment 四项）`);
        }
        return [module, "resolve", String(id), ...dataArgs(fields)];
    }
    if (action === "start" && module === "task") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) start 需要 id`);
        const missing = ["realStarted"].filter((k) => fields?.[k] === undefined);
        if (missing.length > 0) {
            throw new Error(`task start 必须提供 ${missing.join("、")}（realStarted 实际开始，必填）`);
        }
        return [module, "start", String(id), ...dataArgs(fields)];
    }
    if (action === "finish" && module === "task") {
        if (id === undefined)
            throw new Error(`${info.label}(${module}) finish 需要 id`);
        const missing = ["currentConsumed", "realStarted", "finishedDate"].filter((k) => fields?.[k] === undefined);
        if (missing.length > 0) {
            throw new Error(`task finish 必须提供 ${missing.join("、")}（currentConsumed/realStarted/finishedDate，必填）`);
        }
        return [module, "finish", String(id), ...dataArgs(fields)];
    }
    if (id === undefined)
        throw new Error(`${info.label}(${module}) ${action} 需要 id`);
    return [module, action, String(id), ...dataArgs(fields)];
}
//# sourceMappingURL=schema.js.map