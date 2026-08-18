/**
 * /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
 * 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
 * 内部管理）。同源路由，不暴露任何凭证。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { runZentao, runZentaoLoose, asCliError } from "./lib/cli.ts";

export const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export const LOGIN_PATH = "/__dsh-zentao__/login";

export interface OverviewRow {
  id: string | number;
  /** 标题字段：项目行用 name，bug 行用 title（CLI 原样透传，两者都可能出现）。 */
  name?: string;
  title?: string;
  status: string;
  [key: string]: unknown;
}

export interface OverviewData {
  myTasks: OverviewRow[];
  myBugs: OverviewRow[];
  activeProjects: OverviewRow[];
  error?: string;
}

interface Queries {
  tasks: () => Promise<unknown>;
  bugs: () => Promise<unknown>;
  projects: () => Promise<unknown>;
}

const defaultQueries: Queries = {
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
export async function overviewData(queries: Queries = defaultQueries): Promise<OverviewData> {
  const [tasks, bugs, projects] = await Promise.allSettled([
    queries.tasks(),
    queries.bugs(),
    queries.projects(),
  ]);
  const firstError = [tasks, bugs, projects]
    .map((r) => (r.status === "rejected" ? (r.reason as Error).message : undefined))
    .find((m) => m !== undefined);
  return {
    myTasks: tasks.status === "fulfilled" && Array.isArray(tasks.value) ? tasks.value : [],
    myBugs: bugs.status === "fulfilled" && Array.isArray(bugs.value) ? bugs.value : [],
    activeProjects:
      projects.status === "fulfilled" && Array.isArray(projects.value)
        ? projects.value.filter((p) => (p as { status?: string }).status === "doing")
        : [],
    ...(firstError !== undefined ? { error: firstError } : {}),
  };
}

/** 默认查询实现：projects 全量过滤；bugs 遍历产品（可配置产品列表见下方）。 */
export function createDefaultQueries(productIds: readonly number[]): Queries {
  return {
    tasks: async () => [],
    bugs: async () => {
      const rows: unknown[] = [];
      for (const pid of productIds) {
        const data = await runZentao(["bug", `--product=${pid}`, "--recPerPage=200"]);
        if (Array.isArray(data)) rows.push(...data);
      }
      return rows;
    },
    projects: async () => runZentao(["project", "--recPerPage=200"]),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export interface LoginBody {
  server?: string;
  account?: string;
  password?: string;
  token?: string;
}

/** 由登录表单构造 CLI 参数；token 优先于 password。缺少必要字段返回 null。 */
export function buildLoginArgs(body: LoginBody): string[] | null {
  const server = body.server?.trim();
  const account = body.account?.trim();
  if (!server || !account) return null;
  const args = ["login", "-s", server, "-u", account];
  const token = body.token?.trim();
  if (token) return [...args, "-t", token];
  if (body.password) return [...args, "-p", body.password];
  return null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

type RunFn = (args: string[]) => Promise<unknown>;

/**
 * POST /__dsh-zentao__/login：面板登录入口。转发 zentao login（凭证经 CLI
 * 写入插件目录的 zentao.json，不经由本层保存）。login 成功输出纯文本而非
 * JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
 */
export function registerLoginApi(ctx: Context, run: RunFn = runZentaoLoose): () => void {
  const webServer = ctx.webServer;
  if (webServer === undefined) return () => {};
  return webServer.register({
    kind: "exact",
    path: LOGIN_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      let body: LoginBody;
      try {
        body = JSON.parse(await readBody(req)) as LoginBody;
      } catch {
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
      } catch (error) {
        sendJson(res, 200, { ok: false, error: asCliError(error).message });
      }
    },
  });
}

export function registerOverviewApi(ctx: Context): () => void {
  const webServer = ctx.webServer;
  if (webServer === undefined) return () => {};
  // 产品 ID 列表：先查一次 product 列表拿到全部产品，再逐产品拉 Bug。
  const route = webServer.register({
    kind: "exact",
    path: OVERVIEW_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      try {
        const products = await runZentao(["product", "--recPerPage=200"]);
        const ids = Array.isArray(products)
          ? products.map((p) => Number((p as { id?: unknown }).id)).filter((n) => Number.isFinite(n))
          : [];
        const data = await overviewData(createDefaultQueries(ids));
        sendJson(res, 200, data);
      } catch (error) {
        sendJson(res, 200, { myTasks: [], myBugs: [], activeProjects: [], error: asCliError(error).message });
      }
    },
  });
  return route;
}
