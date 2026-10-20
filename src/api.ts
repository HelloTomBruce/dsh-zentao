/**
 * /__dsh-zentao__/overview 数据端点：按工作区绑定配置（<工作区>/.dsh-zentao.json）
 * 聚合"该工作区所属执行的任务 + 所属范围的 Bug"两个视图，供客户端面板
 * fetch。数据经 zentao CLI 子进程获取（凭证由 CLI 内部管理），同源路由，
 * 不暴露任何凭证。登录端点与配置见文件末尾。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { runZentao, runZentaoLoose, asCliError } from "./lib/cli.ts";
import { bugScopeOf, readWorkspaceConfig, WORKSPACE_CONFIG_FILENAME, type WorkspaceConfig } from "./lib/workspace-config.ts";

export const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export const LOGIN_PATH = "/__dsh-zentao__/login";

export interface OverviewRow {
  id: string | number;
  /** 标题字段：任务行用 name，bug 行用 title（CLI 原样透传，两者都可能出现）。 */
  name?: string;
  title?: string;
  status: string;
  [key: string]: unknown;
}

export interface OverviewData {
  /** 执行下的任务（配置缺 execution 时为空）。 */
  tasks: OverviewRow[];
  /** 范围内的 Bug（product > project > execution 优先取一）。 */
  bugs: OverviewRow[];
  /** 生效的工作区配置摘要（客户端展示绑定信息；未配置时缺省）。 */
  config?: WorkspaceConfig;
  /** 未配置工作区绑定（客户端显示引导态）。 */
  unconfigured?: boolean;
  /** 提示信息（如"配置缺 execution，任务视图为空"）。 */
  note?: string;
  error?: string;
}

interface Queries {
  tasks: () => Promise<unknown>;
  bugs: () => Promise<unknown>;
}

/**
 * 按工作区配置构造两次 CLI 查询。注入 queries 便于测试：
 * - tasks: `task --executionID=<id> --recPerPage=200`（execution 缺省 → 空数组 + note）
 * - bugs: `bug --product|--project|--execution=<id> --recPerPage=200`
 */
export function createQueries(config: WorkspaceConfig, run: (args: string[]) => Promise<unknown> = runZentao): Queries {
  return {
    tasks: config.execution === undefined
      ? async () => []
      : () => run(["task", `--executionID=${config.execution}`, "--recPerPage=200"]),
    bugs: (() => {
      const scope = bugScopeOf(config);
      return scope === null
        ? async () => []
        : () => run(["bug", `${scope.flag}=${scope.value}`, "--recPerPage=200"]);
    })(),
  };
}

/** 聚合两次查询；单边失败时另一边仍返回，并透出首个错误信息。 */
export async function overviewData(config: WorkspaceConfig, queries: Queries): Promise<OverviewData> {
  const [tasks, bugs] = await Promise.allSettled([queries.tasks(), queries.bugs()]);
  const firstError = [tasks, bugs]
    .map((r) => (r.status === "rejected" ? (r.reason as Error).message : undefined))
    .find((m) => m !== undefined);
  const rows = (r: PromiseSettledResult<unknown>): OverviewRow[] =>
    r.status === "fulfilled" && Array.isArray(r.value) ? (r.value as OverviewRow[]) : [];
  return {
    tasks: rows(tasks),
    bugs: rows(bugs),
    config,
    ...(config.execution === undefined ? { note: `配置缺 execution，任务视图为空（在 ${WORKSPACE_CONFIG_FILENAME} 中补充）` } : {}),
    ...(firstError !== undefined ? { error: firstError } : {}),
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
 * 写入 dsh 用户目录的 zentao.json，不经由本层保存）。login 成功输出纯文本
 * 而非 JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
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

/** overview 结果缓存 TTL：面板重复打开直接命中，避免重复 CLI 调用。 */
const OVERVIEW_CACHE_TTL = 60_000;

/** 从请求 URL 解析 workspace 查询参数（URL 解码；decode 失败返回 undefined）。 */
function workspaceOf(req: IncomingMessage): string | undefined {
  const url = req.url ?? "";
  const match = /[?&]workspace=([^&]*)/.exec(url);
  if (match === null || match[1] === undefined || match[1] === "") return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&fresh=1]：
 * 读该工作区的 .dsh-zentao.json，按配置拉取任务与 Bug。缓存按工作区分键
 * （60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
 */
export function registerOverviewApi(ctx: Context, deps: {
  readConfig?: typeof readWorkspaceConfig;
  run?: RunFn;
} = {}): () => void {
  const webServer = ctx.webServer;
  if (webServer === undefined) return () => {};
  const readConfig = deps.readConfig ?? readWorkspaceConfig;
  const cache = new Map<string, { at: number; data: OverviewData }>();
  const inflight = new Map<string, Promise<OverviewData>>();
  const compute = async (workspace: string): Promise<OverviewData> => {
    const result = await readConfig(workspace);
    if (!result.ok) {
      return { tasks: [], bugs: [], error: `${WORKSPACE_CONFIG_FILENAME}：${result.error}` };
    }
    if (result.config === null) {
      return { tasks: [], bugs: [], unconfigured: true };
    }
    return overviewData(result.config, createQueries(result.config, deps.run));
  };
  return webServer.register({
    kind: "exact",
    path: OVERVIEW_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      const workspace = workspaceOf(req);
      if (workspace === undefined) {
        sendJson(res, 400, { tasks: [], bugs: [], error: "缺少 workspace 查询参数（工作区绝对路径）" });
        return;
      }
      try {
        const fresh = (req.url ?? "").includes("fresh=1");
        const key = workspace;
        if (!fresh) {
          const hit = cache.get(key);
          if (hit !== undefined && Date.now() - hit.at < OVERVIEW_CACHE_TTL) {
            sendJson(res, 200, hit.data);
            return;
          }
        }
        let pending = inflight.get(key);
        if (pending === undefined) {
          pending = compute(workspace)
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
      } catch (error) {
        sendJson(res, 200, { tasks: [], bugs: [], error: asCliError(error).message });
      }
    },
  });
}
