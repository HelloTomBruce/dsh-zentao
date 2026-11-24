/**
 * /__dsh-zentao__/overview 数据端点：按工作区绑定配置（<工作区>/.dsh-zentao.json）
 * 聚合"该工作区所属执行的任务 + 所属范围的 Bug"两个视图，供客户端面板
 * fetch。数据经 zentao CLI 子进程获取（凭证由 CLI 内部管理），同源路由，
 * 不暴露任何凭证。登录端点与配置见文件末尾。
 */
import { runZentao, runZentaoLoose, asCliError } from "./lib/cli.js";
import { readCurrentProfileInfo } from "./lib/config.js";
import { bugScopeOf, readWorkspaceConfig, WORKSPACE_CONFIG_FILENAME } from "./lib/workspace-config.js";
export const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export const LOGIN_PATH = "/__dsh-zentao__/login";
export const FILE_PATH = "/__dsh-zentao__/file";
export const OVERVIEW_VIEWS = ["tasks", "bugs", "stories", "testtasks", "testcases"];
/**
 * 集群负载均衡容错：个别后端节点异常时——① 回退返回其他 execution 的数据
 * （数据形状检查，仅 tasks 用 expectExecution）；② 翻页中途报「服务端分页未
 * 向前推进」（瞬时错误，--all 多页拉取放大了命中概率）——自动重试命中正常
 * 节点，最多 3 次；其他错误（如未登录 1006）不重试直接抛。
 */
export async function fetchWithNodeRetry(run, expectExecution) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await run();
            if (expectExecution !== undefined && Array.isArray(res) && res.length > 0) {
                const first = res[0];
                if (first.execution !== undefined && String(first.execution) !== String(expectExecution)) {
                    continue;
                }
            }
            return res;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/分页未向前推进/.test(message))
                throw error;
        }
    }
    return run();
}
/**
 * 面板表格实际渲染的列（panel.tsx 卡片/表格共同用到的字段）。
 * overview 查询用 --fields 裁剪到这些列，降低子进程传输与序列化开销。
 * 未知字段会被 CLI 静默丢弃（实测），故裁剪是安全的。导出供测试共享单一事实源。
 */
export const TASK_PANEL_FIELDS = "id,name,status,pri,deadline,assignedTo,assignedToRealName,openedBy,execution";
export const BUG_PANEL_FIELDS = "id,title,status,pri,severity,deadline,assignedTo,assignedToRealName,openedBy";
export const STORY_PANEL_FIELDS = "id,title,status,pri,stage,plan,assignedTo,assignedToRealName,openedBy";
export const TESTTASK_PANEL_FIELDS = "id,name,status,pri,owner,build,begin,end";
export const TESTCASE_PANEL_FIELDS = "id,title,status,pri,type,stage,lastRunResult,openedBy";
/** 概览查询的每页条数：默认 20 页大小会把大执行拖成上百页，200 显著减页数（实测 103→11 页、3x 提速）。 */
const OVERVIEW_PAGE_SIZE = 200;
const VIEW_DEFS = {
    tasks: {
        module: "task",
        fields: TASK_PANEL_FIELDS,
        scopeArgs: (c) => (c.execution !== undefined ? [`--execution-id=${c.execution}`] : null),
        missingNote: (f) => `配置缺 execution，任务视图为空（在 ${f} 中补充）`,
    },
    bugs: {
        module: "bug",
        fields: BUG_PANEL_FIELDS,
        scopeArgs: (c) => {
            const s = bugScopeOf(c);
            return s === null ? null : [`${s.flag}=${s.value}`];
        },
        missingNote: (f) => `配置缺 product / project / execution，Bug 视图为空（在 ${f} 中补充）`,
    },
    stories: {
        module: "story",
        fields: STORY_PANEL_FIELDS,
        scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
        missingNote: (f) => `配置缺 product，需求视图为空（在 ${f} 中补充）`,
    },
    testtasks: {
        module: "testtask",
        fields: TESTTASK_PANEL_FIELDS,
        scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
        missingNote: (f) => `配置缺 product，测试单视图为空（在 ${f} 中补充）`,
    },
    testcases: {
        module: "testcase",
        fields: TESTCASE_PANEL_FIELDS,
        scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
        missingNote: (f) => `配置缺 product，用例视图为空（在 ${f} 中补充）`,
    },
};
/**
 * 按工作区配置与视图构造单条 CLI 查询（zentao-cli ≥ 0.5.0 命令面）：
 * `<module> list <scope> --fields=<面板列> [--browse-type/--filter/--search] --page-size=200 --all`
 * 默认 run 解包 runZentao 的 {data, meta}，只取 data；scope 缺失返回 null（调用方给 note）。
 */
export function createViewQuery(config, view, filters = {}, run) {
    const def = VIEW_DEFS[view];
    const scope = def.scopeArgs(config);
    if (scope === null)
        return null;
    const runData = run ?? (async (args) => (await runZentao(args)).data);
    const extra = [
        ...(filters.browse !== undefined ? [`--browse-type=${filters.browse}`] : []),
        ...(filters.filter !== undefined ? [`--filter=${filters.filter}`] : []),
        ...(filters.search !== undefined ? [`--search=${filters.search}`] : []),
    ];
    const args = [def.module, "list", ...scope, `--fields=${def.fields}`, ...extra, `--page-size=${OVERVIEW_PAGE_SIZE}`, "--all"];
    return view === "tasks"
        ? () => fetchWithNodeRetry(() => runData(args), config.execution)
        : () => fetchWithNodeRetry(() => runData(args));
}
/** 单视图查询聚合：失败透出错误信息，scope 缺失给 note。 */
export async function overviewViewData(config, view, query, profileInfo = readCurrentProfileInfo()) {
    const def = VIEW_DEFS[view];
    const base = {
        view,
        rows: [],
        config,
        ...(profileInfo ? {
            currentUser: { account: profileInfo.account, realname: profileInfo.realname },
            serverUrl: profileInfo.server,
        } : {}),
    };
    if (query === null) {
        return { ...base, note: def.missingNote(WORKSPACE_CONFIG_FILENAME) };
    }
    try {
        const result = await query();
        return { ...base, rows: Array.isArray(result) ? result : [] };
    }
    catch (error) {
        return { ...base, error: asCliError(error).message };
    }
}
function sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}
/** 由登录表单构造 CLI 参数；token 优先于 password。缺少必要字段返回 null。 */
export function buildLoginArgs(body) {
    const server = body.server?.trim();
    const account = body.account?.trim();
    if (!server || !account)
        return null;
    const args = ["login", "-s", server, "-u", account];
    const token = body.token?.trim();
    if (token)
        return [...args, "-t", token];
    if (body.password)
        return [...args, "-p", body.password];
    return null;
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
/**
 * POST /__dsh-zentao__/login：面板登录入口。转发 zentao login（凭证经 CLI
 * 写入 dsh 用户目录的 zentao.json，不经由本层保存）。login 成功输出纯文本
 * 而非 JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
 */
export function registerLoginApi(ctx, run = runZentaoLoose) {
    const webServer = ctx.webServer;
    if (webServer === undefined)
        return () => { };
    // 清理任何残留的同路径精确路由，防止插件热重载/重装时抛 duplicate exact route
    if (webServer.exact && typeof webServer.exact.delete === "function") {
        webServer.exact.delete(LOGIN_PATH);
    }
    const dispose = webServer.register({
        kind: "exact",
        path: LOGIN_PATH,
        handler: async (req, res) => {
            if ((req.method ?? "GET") !== "POST") {
                sendJson(res, 405, { error: "method not allowed" });
                return;
            }
            let body;
            try {
                body = JSON.parse(await readBody(req));
            }
            catch {
                sendJson(res, 400, { error: "请求体不是合法 JSON" });
                return;
            }
            const args = buildLoginArgs(body);
            if (args === null) {
                sendJson(res, 400, { error: "缺少 server / account，或 password / token 均未提供" });
                return;
            }
            try {
                await run(args);
                sendJson(res, 200, { ok: true });
            }
            catch (error) {
                sendJson(res, 200, { ok: false, error: asCliError(error).message });
            }
        },
    });
    return () => {
        try {
            dispose?.();
        }
        catch { }
        if (webServer.exact && typeof webServer.exact.delete === "function") {
            webServer.exact.delete(LOGIN_PATH);
        }
    };
}
function detectContentType(buf) {
    if (buf.length >= 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a")
        return "image/png";
    if (buf.length >= 3 && buf.subarray(0, 3).toString("hex") === "ffd8ff")
        return "image/jpeg";
    if (buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a"))
        return "image/gif";
    if (buf.length >= 4 && buf.subarray(0, 4).toString("hex") === "52494646")
        return "image/webp";
    return "application/octet-stream";
}
/**
 * GET /__dsh-zentao__/file?id=<文件ID>：
 * 图片流代理端点。使用当前已登录凭证向禅道拉取文件二进制并直吐浏览器，
 * 解决浏览器同源保护、CORS 与鉴权导致 Bug 详情中图片无法展示的问题。
 */
export function registerFileApi(ctx) {
    const webServer = ctx.webServer;
    if (webServer === undefined)
        return () => { };
    if (webServer.exact && typeof webServer.exact.delete === "function") {
        webServer.exact.delete(FILE_PATH);
    }
    const dispose = webServer.register({
        kind: "exact",
        path: FILE_PATH,
        handler: async (req, res) => {
            const url = req.url ?? "";
            const match = /[?&]id=(\d+)/.exec(url);
            if (!match || !match[1]) {
                sendJson(res, 400, { error: "缺少 id 查询参数" });
                return;
            }
            const fileId = match[1];
            const profile = readCurrentProfileInfo();
            if (!profile?.server || !profile.token) {
                sendJson(res, 401, { error: "禅道未登录" });
                return;
            }
            try {
                const downloadUrl = `${profile.server.replace(/\/+$/, "")}/api.php/v2/files/${fileId}/download`;
                const upstream = await fetch(downloadUrl, {
                    headers: {
                        Token: profile.token,
                        Cookie: "tab=project; app=project",
                    },
                });
                if (!upstream.ok) {
                    sendJson(res, upstream.status, { error: `下载失败: HTTP ${upstream.status}` });
                    return;
                }
                const buf = Buffer.from(await upstream.arrayBuffer());
                const contentType = detectContentType(buf);
                res.writeHead(200, {
                    "content-type": contentType,
                    "cache-control": "public, max-age=86400",
                    "content-length": String(buf.length),
                });
                res.end(buf);
            }
            catch (err) {
                sendJson(res, 500, { error: err instanceof Error ? err.message : "图片拉取失败" });
            }
        },
    });
    return () => {
        try {
            dispose?.();
        }
        catch { }
        if (webServer.exact && typeof webServer.exact.delete === "function") {
            webServer.exact.delete(FILE_PATH);
        }
    };
}
/** overview 结果缓存 TTL：面板重复打开直接命中，避免重复 CLI 调用。 */
const OVERVIEW_CACHE_TTL = 60_000;
/** 从请求 URL 解析 workspace 查询参数（URL 解码；decode 失败返回 undefined）。 */
function workspaceOf(req) {
    const url = req.url ?? "";
    const match = /[?&]workspace=([^&]*)/.exec(url);
    if (match === null || match[1] === undefined || match[1] === "")
        return undefined;
    try {
        return decodeURIComponent(match[1]);
    }
    catch {
        return undefined;
    }
}
/** 筛选参数白名单（字母数字与 = , _ - ! ），防异常字符进入 CLI 参数。 */
const FILTER_PARAM_RE = /^[a-zA-Z0-9=,_!-]{1,120}$/;
/**
 * 解析面板筛选参数（browse/filter/search，单视图作用域）。
 * 返回 null 表示存在非法参数（调用方应 400）；全部缺省返回 {}。
 * search 允许任意非控字符（含中文），仅拒绝 - 开头（防 CLI flag 注入）与超长。
 */
export function panelFiltersOf(req) {
    const url = req.url ?? "";
    const out = {};
    for (const name of ["browse", "filter", "search"]) {
        const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
        if (match === null || match[1] === undefined || match[1] === "")
            continue;
        let value;
        try {
            value = decodeURIComponent(match[1]);
        }
        catch {
            return null;
        }
        if (name === "search") {
            const trimmed = value.trim();
            if (trimmed === "")
                continue;
            if (trimmed.length > 120 || trimmed.startsWith("-") || /[-~\x00-\x1f]/.test(trimmed))
                return null;
            out[name] = trimmed;
        }
        else {
            if (!FILTER_PARAM_RE.test(value))
                return null;
            out[name] = value;
        }
    }
    return out;
}
/**
 * 解析 execution 覆盖参数（仅 tasks 视图使用；面板多执行切换下拉）。
 * 缺省 undefined；非法（非正整数）返回 null（调用方 400）。
 */
export function executionOverrideOf(req) {
    const match = /[?&]execution=([^&]*)/.exec(req.url ?? "");
    if (match === null || match[1] === undefined || match[1] === "")
        return undefined;
    const num = Number(match[1]);
    return Number.isInteger(num) && num > 0 ? num : null;
}
/** 解析视图参数：缺省 tasks；不在白名单返回 null（调用方 400）。 */
export function overviewViewOf(req) {
    const match = /[?&]view=([^&]*)/.exec(req.url ?? "");
    if (match === null || match[1] === undefined || match[1] === "")
        return "tasks";
    const value = match[1];
    return OVERVIEW_VIEWS.includes(value) ? value : null;
}
/** 缓存键：工作区 + 视图 + execution 覆盖 + 筛选参数（相互独立缓存）。 */
function cacheKeyOf(workspace, view, executionOverride, filters) {
    return [
        workspace, view, executionOverride ?? "",
        filters.browse ?? "", filters.filter ?? "", filters.search ?? "",
    ].join("|");
}
/**
 * GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&view=tasks|bugs][&fresh=1]：
 * 读该工作区的 .dsh-zentao.json，按配置拉取**单个视图**的数据（面板切 Tab 懒加载）。
 * 缓存按 工作区+视图+筛选 分键（60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
 */
export function registerOverviewApi(ctx, deps = {}) {
    const webServer = ctx.webServer;
    if (webServer === undefined)
        return () => { };
    // 清理任何残留的同路径精确路由，防止插件热重载/重装时抛 duplicate exact route
    if (webServer.exact && typeof webServer.exact.delete === "function") {
        webServer.exact.delete(OVERVIEW_PATH);
    }
    const readConfig = deps.readConfig ?? readWorkspaceConfig;
    const cache = new Map();
    const inflight = new Map();
    const compute = async (workspace, view, executionOverride, filters) => {
        const result = await readConfig(workspace);
        if (!result.ok) {
            return { view, rows: [], error: `${WORKSPACE_CONFIG_FILENAME}：${result.error}` };
        }
        if (result.config === null) {
            return { view, rows: [], unconfigured: true };
        }
        // tasks 视图的 execution 覆盖（面板多执行切换）：仅影响本次查询，响应 config 保持绑定原值
        const effective = executionOverride !== undefined && view === "tasks"
            ? { ...result.config, execution: executionOverride }
            : result.config;
        const data = await overviewViewData(effective, view, createViewQuery(effective, view, filters, deps.run));
        return { ...data, config: result.config };
    };
    const dispose = webServer.register({
        kind: "exact",
        path: OVERVIEW_PATH,
        handler: async (req, res) => {
            if ((req.method ?? "GET") !== "GET") {
                sendJson(res, 405, { error: "method not allowed" });
                return;
            }
            const workspace = workspaceOf(req);
            if (workspace === undefined) {
                sendJson(res, 400, { error: "缺少 workspace 查询参数（工作区绝对路径）" });
                return;
            }
            const view = overviewViewOf(req);
            if (view === null) {
                sendJson(res, 400, { error: `非法视图参数（可选：${OVERVIEW_VIEWS.join("/")}）` });
                return;
            }
            const filters = panelFiltersOf(req);
            if (filters === null) {
                sendJson(res, 400, { error: "非法筛选参数（browse/filter 仅允许字母数字与 = , _ - !；search 不得以 - 开头）" });
                return;
            }
            const executionOverride = executionOverrideOf(req);
            if (executionOverride === null) {
                sendJson(res, 400, { error: "非法 execution 参数（须为正整数）" });
                return;
            }
            try {
                const fresh = (req.url ?? "").includes("fresh=1");
                const key = cacheKeyOf(workspace, view, executionOverride, filters);
                if (!fresh) {
                    const hit = cache.get(key);
                    if (hit !== undefined && Date.now() - hit.at < OVERVIEW_CACHE_TTL) {
                        sendJson(res, 200, hit.data);
                        return;
                    }
                }
                let pending = inflight.get(key);
                if (pending === undefined) {
                    pending = compute(workspace, view, executionOverride, filters)
                        .then((data) => {
                        cache.set(key, { at: Date.now(), data });
                        return data;
                    })
                        .finally(() => {
                        inflight.delete(key);
                    });
                    inflight.set(key, pending);
                }
                sendJson(res, 200, await pending);
            }
            catch (error) {
                sendJson(res, 200, { view, rows: [], error: asCliError(error).message });
            }
        },
    });
    return () => {
        try {
            dispose?.();
        }
        catch { }
        if (webServer.exact && typeof webServer.exact.delete === "function") {
            webServer.exact.delete(OVERVIEW_PATH);
        }
    };
}
//# sourceMappingURL=api.js.map