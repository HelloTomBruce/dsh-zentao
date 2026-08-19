/**
 * /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
 * 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
 * 内部管理）。同源路由，不暴露任何凭证。
 */
import { runZentao, runZentaoLoose, asCliError } from "./lib/cli.js";
export const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export const LOGIN_PATH = "/__dsh-zentao__/login";
const defaultQueries = {
    // task 列表需要 executionID —— 无法全局枚举，退化为按产品/执行探查：
    // 真实实现见 overviewData 内的 fallback 逻辑（见下方注释）。
    tasks: async () => [],
    bugs: async () => [],
    projects: async () => [],
};
/**
 * 聚合三次查询。注入 queries 便于测试；默认实现：
 * - bugs: `bug --product=<p>` 逐个产品拉取（本项目产品 id 2..22）
 * - projects: `project --recPerPage=200` 后按 status=doing 过滤
 * - tasks: 无全局入口，返回空（CLI 局限），面板展示"任务视图需指定执行"
 */
export async function overviewData(queries = defaultQueries) {
    const [tasks, bugs, projects] = await Promise.allSettled([
        queries.tasks(),
        queries.bugs(),
        queries.projects(),
    ]);
    const firstError = [tasks, bugs, projects]
        .map((r) => (r.status === "rejected" ? r.reason.message : undefined))
        .find((m) => m !== undefined);
    return {
        myTasks: tasks.status === "fulfilled" && Array.isArray(tasks.value) ? tasks.value : [],
        myBugs: bugs.status === "fulfilled" && Array.isArray(bugs.value) ? bugs.value : [],
        activeProjects: projects.status === "fulfilled" && Array.isArray(projects.value)
            ? projects.value.filter((p) => p.status === "doing")
            : [],
        ...(firstError !== undefined ? { error: firstError } : {}),
    };
}
/** 带并发上限的 map：保持结果顺序（CLI 子进程开销大，避免无上限并发）。 */
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}
/** 默认查询实现：projects 全量过滤；bugs 按产品并行拉取（并发上限 6）。 */
export function createDefaultQueries(productIds) {
    return {
        tasks: async () => [],
        bugs: async () => {
            const rows = [];
            const lists = await mapLimit(productIds, 6, async (pid) => runZentao(["bug", `--product=${pid}`, "--recPerPage=200"]));
            for (const data of lists)
                if (Array.isArray(data))
                    rows.push(...data);
            return rows;
        },
        projects: async () => runZentao(["project", "--recPerPage=200"]),
    };
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
 * 写入插件目录的 zentao.json，不经由本层保存）。login 成功输出纯文本而非
 * JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
 */
export function registerLoginApi(ctx, run = runZentaoLoose) {
    const webServer = ctx.webServer;
    if (webServer === undefined)
        return () => { };
    return webServer.register({
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
}
/** overview 结果缓存 TTL：面板重复打开直接命中，避免每次 21 次 CLI 调用。 */
const OVERVIEW_CACHE_TTL = 60_000;
export function registerOverviewApi(ctx) {
    const webServer = ctx.webServer;
    if (webServer === undefined)
        return () => { };
    // 60s 缓存 + 并发去重：TTL 内重复打开面板秒回；?fresh=1 强制刷新（登录后用）。
    let cache = null;
    let inflight = null;
    // 产品 ID 列表：先查一次 product 列表拿到全部产品，再逐产品并行拉 Bug。
    const compute = async () => {
        const products = await runZentao(["product", "--recPerPage=200"]);
        const ids = Array.isArray(products)
            ? products.map((p) => Number(p.id)).filter((n) => Number.isFinite(n))
            : [];
        return overviewData(createDefaultQueries(ids));
    };
    const route = webServer.register({
        kind: "exact",
        path: OVERVIEW_PATH,
        handler: async (req, res) => {
            if ((req.method ?? "GET") !== "GET") {
                sendJson(res, 405, { error: "method not allowed" });
                return;
            }
            try {
                const fresh = (req.url ?? "").includes("fresh=1");
                if (!fresh && cache !== null && Date.now() - cache.at < OVERVIEW_CACHE_TTL) {
                    sendJson(res, 200, cache.data);
                    return;
                }
                inflight ??= compute()
                    .then((data) => {
                    cache = { at: Date.now(), data };
                    return data;
                })
                    .finally(() => {
                    inflight = null;
                });
                sendJson(res, 200, await inflight);
            }
            catch (error) {
                sendJson(res, 200, { myTasks: [], myBugs: [], activeProjects: [], error: asCliError(error).message });
            }
        },
    });
    return route;
}
//# sourceMappingURL=api.js.map