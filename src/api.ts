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
import { readCurrentProfileInfo, type CurrentProfileInfo } from "./lib/config.ts";
import { readWorkspaceConfig, WORKSPACE_CONFIG_FILENAME } from "./lib/workspace-config.ts";
import { VIEWS, VIEW_KEYS, isViewKey, type ViewKey, type WorkspaceBinding } from "./views.ts";

export const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export const LOGIN_PATH = "/__dsh-zentao__/login";
export const FILE_PATH = "/__dsh-zentao__/file";
export const DETAIL_PATH = "/__dsh-zentao__/detail";

/** 不支持 get 子命令的视图（testtask 仅 list/create/update/delete）。 */
const DETAIL_UNSUPPORTED_VIEWS: readonly OverviewView[] = ["testtasks"];

export interface OverviewRow {
  id: string | number;
  /** 标题字段：任务行用 name，bug/需求/用例行用 title（CLI 原样透传，两者都可能出现）。 */
  name?: string;
  title?: string;
  status: string;
  [key: string]: unknown;
}

/** 工作区绑定（registry 单源形状；兼容旧引用名）。 */
export type WorkspaceConfig = WorkspaceBinding;

/** 概览视图 key（registry 单源：src/views.ts）。 */
export type OverviewView = ViewKey;
export const OVERVIEW_VIEWS: readonly OverviewView[] = VIEW_KEYS;

export interface OverviewViewData {
  /** 本次返回的视图。 */
  view: OverviewView;
  /** 该视图的数据行。 */
  rows: OverviewRow[];
  /** 生效的工作区配置摘要（客户端展示绑定信息；未配置时缺省）。 */
  config?: WorkspaceConfig | undefined;
  /** 未配置工作区绑定（客户端显示引导态）。 */
  unconfigured?: boolean | undefined;
  /** 当前登录账号信息（客户端用于【只看指派给我】本地过滤）。 */
  currentUser?: { account: string; realname?: string | undefined } | undefined;
  /** 禅道服务器地址（客户端用于生成 Web 查看直链）。 */
  serverUrl?: string | undefined;
  /** 提示信息（如"配置缺 execution，任务视图为空"）。 */
  note?: string | undefined;
  error?: string | undefined;
}

/**
 * 集群负载均衡容错：个别后端节点异常时——① 回退返回其他 execution 的数据
 * （数据形状检查，仅 tasks 有 expectExecution）；② 翻页中途报「服务端分页未
 * 向前推进」（瞬时错误，--all 多页拉取放大了命中概率）——自动重试命中正常
 * 节点，最多 3 次（带 300ms*次数 退避）；其他错误（如未登录 1006）不重试直接抛。
 * 耗尽语义：tasks 的 execution 形状可校验——3 次全不匹配时**抛错**而非静默
 * 返回可能来自回退节点的脏数据；无形状校验的视图退回第 4 次调用（若仍抛错
 * 则自然传播）。
 */
export async function fetchWithNodeRetry(run: () => Promise<unknown>, expectExecution?: number): Promise<unknown> {
  let mismatched = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    try {
      const res = await run();
      if (expectExecution !== undefined && Array.isArray(res) && res.length > 0) {
        const first = res[0] as { execution?: string | number };
        if (first.execution !== undefined && String(first.execution) !== String(expectExecution)) {
          mismatched = true;
          continue;
        }
      }
      return res;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/分页未向前推进/.test(message)) throw error;
    }
  }
  if (expectExecution !== undefined && mismatched) {
    throw new Error(`任务数据连续 3 次来自异常执行节点（期望 execution=${expectExecution}），为避免展示错误迭代的数据已放弃本次加载，请稍后重试`);
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

/** 面板筛选（单视图作用域，经查询参数传入，白名单校验后拼入 CLI 参数）。 */
export interface PanelFilters {
  browse?: string;
  filter?: string;
  search?: string;
}

/** 概览查询的每页条数：默认 20 页大小会把大执行拖成上百页，200 显著减页数（实测 103→11 页、3x 提速）。 */
const OVERVIEW_PAGE_SIZE = 200;

export type ViewQueryFn = () => Promise<unknown>;

/**
 * 按工作区配置与视图构造单条 CLI 查询（zentao-cli ≥ 0.5.0 命令面）：
 * `<module> list <scope> --fields=<面板列> [--browse-type/--filter/--search] --page-size=200 --all`
 * 默认 run 解包 runZentao 的 {data, meta}，只取 data；scope 缺失返回 null（调用方给 note）。
 */
export function createViewQuery(
  config: WorkspaceConfig,
  view: OverviewView,
  filters: PanelFilters = {},
  run?: (args: string[]) => Promise<unknown>,
): ViewQueryFn | null {
  const def = VIEWS[view];
  const scope = def.scopeArgs(config);
  if (scope === null) return null;
  const runData = run ?? (async (args: string[]) => (await runZentao(args)).data);
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
export async function overviewViewData(
  config: WorkspaceConfig,
  view: OverviewView,
  query: ViewQueryFn | null,
  profileInfo: CurrentProfileInfo | null = readCurrentProfileInfo(),
): Promise<OverviewViewData> {
  const def = VIEWS[view];
  const base: OverviewViewData = {
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
    return { ...base, rows: Array.isArray(result) ? (result as OverviewRow[]) : [] };
  } catch (error) {
    return { ...base, error: asCliError(error).message };
  }
}

/**
 * 本机来源校验：Origin/Host 必须为本机回环地址。作用：
 * - 恶意网页发的跨源 fetch/XHR 会带 Origin: https://evil → 拒绝（CSRF 面）
 * - <img>/<form> 等无 Origin 的跨源请求由浏览器 PNA（私网访问限制）逐步拦截，
 *   本校验是其之外的服务端防线
 */
function isLocalRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== "null") {
    try {
      const u = new URL(origin);
      if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname)) return false;
    } catch {
      return false;
    }
  }
  const host = (req.headers.host ?? "").split(":")[0] ?? "";
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
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
  const webServer = ctx.webServer as unknown as {
    register: (route: unknown) => () => void;
    exact?: Map<string, unknown>;
  } | undefined;
  if (webServer === undefined) return () => {};

  // 清理任何残留的同路径精确路由，防止插件热重载/重装时抛 duplicate exact route
  if (webServer.exact && typeof webServer.exact.delete === "function") {
    webServer.exact.delete(LOGIN_PATH);
  }

  const dispose = webServer.register({
    kind: "exact",
    path: LOGIN_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      // 登录会覆盖本地凭证——只接受本机来源的 JSON 请求（防恶意网页 text/plain
      // 简单请求跨源送达 JSON body 覆盖登录态/指向攻击者服务器）
      if (!isLocalRequest(req)) {
        sendJson(res, 403, { error: "拒绝非本机来源的登录请求" });
        return;
      }
      if (!/application\/json/i.test(req.headers["content-type"] ?? "")) {
        sendJson(res, 415, { error: "content-type 必须为 application/json" });
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

  return () => {
    try {
      dispose?.();
    } catch {}
    if (webServer.exact && typeof webServer.exact.delete === "function") {
      webServer.exact.delete(LOGIN_PATH);
    }
  };
}

function detectContentType(buf: Buffer): string {
  if (buf.length >= 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.length >= 3 && buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("hex") === "52494646") return "image/webp";
  return "application/octet-stream";
}

/**
 * GET /__dsh-zentao__/file?id=<文件ID>：
 * 图片流代理端点。使用当前已登录凭证向禅道拉取文件二进制并直吐浏览器，
 * 解决浏览器同源保护、CORS 与鉴权导致 Bug 详情中图片无法展示的问题。
 */
/** 附件代理单文件大小上限（超限拒绝而非整块进内存）。 */
const MAX_FILE_PROXY_BYTES = 50 * 1024 * 1024;

export function registerFileApi(ctx: Context): () => void {
  const webServer = ctx.webServer as unknown as {
    register: (route: unknown) => () => void;
    exact?: Map<string, unknown>;
  } | undefined;
  if (webServer === undefined) return () => {};

  if (webServer.exact && typeof webServer.exact.delete === "function") {
    webServer.exact.delete(FILE_PATH);
  }

  const dispose = webServer.register({
    kind: "exact",
    path: FILE_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      // 附件经当前登录凭证拉取——拒绝非本机来源（防恶意页面借本机代理枚举附件）
      if (!isLocalRequest(req)) {
        sendJson(res, 403, { error: "拒绝非本机来源的附件请求" });
        return;
      }
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
          signal: AbortSignal.timeout(30_000), // 上游超时，防挂死连接占住面板
        });
        if (!upstream.ok) {
          sendJson(res, upstream.status, { error: `下载失败: HTTP ${upstream.status}` });
          return;
        }
        const declared = Number(upstream.headers.get("content-length") ?? 0);
        if (declared > MAX_FILE_PROXY_BYTES) {
          sendJson(res, 413, { error: `附件过大（${(declared / 1024 / 1024).toFixed(1)}MB > 50MB 上限）` });
          return;
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.byteLength > MAX_FILE_PROXY_BYTES) {
          sendJson(res, 413, { error: "附件超过 50MB 上限" });
          return;
        }
        const contentType = detectContentType(buf);
        res.writeHead(200, {
          "content-type": contentType,
          // private：附件可能含敏感内容，不应被共享缓存/中间代理存储
          "cache-control": "private, max-age=86400",
          "content-length": String(buf.length),
        });
        res.end(buf);
      } catch (err: unknown) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "图片拉取失败" });
      }
    },
  });

  return () => {
    try {
      dispose?.();
    } catch {}
    if (webServer.exact && typeof webServer.exact.delete === "function") {
      webServer.exact.delete(FILE_PATH);
    }
  };
}

/** overview 结果缓存 TTL：面板重复打开直接命中，避免重复 CLI 调用。 */
const OVERVIEW_CACHE_TTL = 60_000;
/** 缓存容量上限（工作区×视图×执行×筛选 组合无界增长防溢出）：超限淘汰最旧条目。 */
const OVERVIEW_CACHE_MAX = 200;

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

/** 筛选参数白名单（字母数字与 = , _ - ! ），防异常字符进入 CLI 参数。 */
const FILTER_PARAM_RE = /^[a-zA-Z0-9=,_!-]{1,120}$/;

/**
 * 解析面板筛选参数（browse/filter/search，单视图作用域）。
 * 返回 null 表示存在非法参数（调用方应 400）；全部缺省返回 {}。
 * search 允许任意非控字符（含中文），仅拒绝 - 开头（防 CLI flag 注入）与超长。
 */
export function panelFiltersOf(req: IncomingMessage): PanelFilters | null {
  const url = req.url ?? "";
  const out: Record<string, string> = {};
  for (const name of ["browse", "filter", "search"] as const) {
    const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
    if (match === null || match[1] === undefined || match[1] === "") continue;
    let value: string;
    try {
      value = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    if (name === "search") {
      const trimmed = value.trim();
      if (trimmed === "") continue;
      // 只拦「以 - 开头」（会被 CLI 当 flag）；关键词内含连字符（如 5G-A）是合法需求
      if (trimmed.length > 120 || trimmed.startsWith("-") || /[\x00-\x1f]/.test(trimmed)) return null;
      out[name] = trimmed;
    } else {
      if (!FILTER_PARAM_RE.test(value)) return null;
      out[name] = value;
    }
  }
  return out as PanelFilters;
}

/**
 * 解析 execution 覆盖参数（仅 tasks 视图使用；面板多执行切换下拉）。
 * 缺省 undefined；非法（非正整数）返回 null（调用方 400）。
 */
export function executionOverrideOf(req: IncomingMessage): number | undefined | null {
  const match = /[?&]execution=([^&]*)/.exec(req.url ?? "");
  if (match === null || match[1] === undefined || match[1] === "") return undefined;
  // ^\d+$ 拒绝 "1e3"/"0x10" 等被 Number() 宽松接受的形态
  if (!/^\d+$/.test(match[1])) return null;
  const num = Number(match[1]);
  return num > 0 ? num : null;
}

/** 解析视图参数：缺省 tasks；不在白名单返回 null（调用方 400）。 */
export function overviewViewOf(req: IncomingMessage): OverviewView | null {
  const match = /[?&]view=([^&]*)/.exec(req.url ?? "");
  if (match === null || match[1] === undefined || match[1] === "") return "tasks";
  const value = match[1];
  return isViewKey(value) ? (value as OverviewView) : null;
}

/** 缓存键：工作区 + 视图 + execution 覆盖 + 筛选参数（相互独立缓存）。 */
function cacheKeyOf(workspace: string, view: OverviewView, executionOverride: number | undefined, filters: PanelFilters): string {
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
export function registerOverviewApi(ctx: Context, deps: {
  readConfig?: typeof readWorkspaceConfig;
  run?: RunFn;
} = {}): () => void {
  const webServer = ctx.webServer as unknown as {
    register: (route: unknown) => () => void;
    exact?: Map<string, unknown>;
  } | undefined;
  if (webServer === undefined) return () => {};

  // 清理任何残留的同路径精确路由，防止插件热重载/重装时抛 duplicate exact route
  if (webServer.exact && typeof webServer.exact.delete === "function") {
    webServer.exact.delete(OVERVIEW_PATH);
  }

  const readConfig = deps.readConfig ?? readWorkspaceConfig;
  const cache = new Map<string, { at: number; data: OverviewViewData }>();
  const inflight = new Map<string, Promise<OverviewViewData>>();
  const compute = async (workspace: string, view: OverviewView, executionOverride: number | undefined, filters: PanelFilters): Promise<OverviewViewData> => {
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
    handler: async (req: IncomingMessage, res: ServerResponse) => {
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
        sendJson(res, 400, { error: "非法筛选参数（browse/filter 仅允许字母数字与 = , _ - !；search 不得以 - 开头、不得含控制符、≤120 字符）" });
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
              // 简单 FIFO 淘汰：Map 保持插入序，超限删最旧（命中不重排，对 60s TTL 足够）
              if (cache.size > OVERVIEW_CACHE_MAX) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined) cache.delete(oldest);
              }
              return data;
            })
            .finally(() => {
              inflight.delete(key);
            });
          inflight.set(key, pending);
        }
        sendJson(res, 200, await pending);
      } catch (error) {
        sendJson(res, 200, { view, rows: [], error: asCliError(error).message });
      }
    },
  });

  return () => {
    try {
      dispose?.();
    } catch {}
    if (webServer.exact && typeof webServer.exact.delete === "function") {
      webServer.exact.delete(OVERVIEW_PATH);
    }
  };
}


/**
 * GET /__dsh-zentao__/detail?view=<视图>&id=<对象ID>：详情端点。
 * 转发 `<module> get <id>` 返回完整对象（面板详情页按类型丰富展示）。
 * testtask 无 get 子命令 → unsupported 标记（面板仅用列表行展示）。
 */
export function registerDetailApi(ctx: Context, run: RunFn = runZentao): () => void {
  const webServer = ctx.webServer as unknown as {
    register: (route: unknown) => () => void;
    exact?: Map<string, unknown>;
  } | undefined;
  if (webServer === undefined) return () => {};

  if (webServer.exact && typeof webServer.exact.delete === "function") {
    webServer.exact.delete(DETAIL_PATH);
  }

  // 同 view+id 的并发请求去重（双击行/快速点击不重复起 CLI 子进程）
  const inflight = new Map<string, Promise<void>>();
  const dispose = webServer.register({
    kind: "exact",
    path: DETAIL_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      const view = overviewViewOf(req);
      if (view === null) {
        sendJson(res, 400, { error: `非法视图参数（可选：${OVERVIEW_VIEWS.join("/")}）` });
        return;
      }
      const idMatch = /[?&]id=(\d+)/.exec(req.url ?? "");
      const id = idMatch?.[1] !== undefined ? Number(idMatch[1]) : 0;
      if (!Number.isInteger(id) || id <= 0) {
        sendJson(res, 400, { error: "缺少或非法 id 参数（正整数）" });
        return;
      }
      if (DETAIL_UNSUPPORTED_VIEWS.includes(view)) {
        sendJson(res, 200, { view, id, unsupported: true });
        return;
      }
      const key = `${view}|${id}`;
      const pending = inflight.get(key);
      if (pending !== undefined) {
        // 复用同键进行中的请求结束后重发本响应（简并：直接提示重试，避免复杂化）
        sendJson(res, 409, { view, id, error: "相同详情正在加载中" });
        return;
      }
      const task = (async () => {
        try {
          const module = VIEWS[view].module;
          // runZentao 返回 {data, meta} 信封——解包 data（完整对象）；缺失时显式报错
          const result = await run([module, "get", String(id)]) as { data?: unknown };
          if (result.data === undefined) {
            sendJson(res, 200, { view, id, error: "CLI 返回缺少 data 字段（对象可能不存在或无权限）" });
            return;
          }
          sendJson(res, 200, { view, id, data: result.data });
        } catch (error) {
          sendJson(res, 200, { view, id, error: asCliError(error).message });
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, task);
    },
  });

  return () => {
    try {
      dispose?.();
    } catch {}
    if (webServer.exact && typeof webServer.exact.delete === "function") {
      webServer.exact.delete(DETAIL_PATH);
    }
  };
}
