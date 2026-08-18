/**
 * /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
 * 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
 * 内部管理）。同源路由，不暴露任何凭证。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { runZentao, asCliError } from "./lib/cli.ts";

export const OVERVIEW_PATH = "/__dsh-zentao__/overview";

export interface OverviewRow {
  id: string | number;
  name: string;
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
