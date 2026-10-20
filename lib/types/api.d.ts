/**
 * /__dsh-zentao__/overview 数据端点：按工作区绑定配置（<工作区>/.dsh-zentao.json）
 * 聚合"该工作区所属执行的任务 + 所属范围的 Bug"两个视图，供客户端面板
 * fetch。数据经 zentao CLI 子进程获取（凭证由 CLI 内部管理），同源路由，
 * 不暴露任何凭证。登录端点与配置见文件末尾。
 */
import type { Context } from "@deepseek-ai/cordis";
import { type CurrentProfileInfo } from "./lib/config.ts";
import { readWorkspaceConfig, type WorkspaceConfig } from "./lib/workspace-config.ts";
export declare const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export declare const LOGIN_PATH = "/__dsh-zentao__/login";
export declare const FILE_PATH = "/__dsh-zentao__/file";
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
    config?: WorkspaceConfig | undefined;
    /** 未配置工作区绑定（客户端显示引导态）。 */
    unconfigured?: boolean | undefined;
    /** 当前登录账号信息（客户端用于【只看指派给我】本地过滤）。 */
    currentUser?: {
        account: string;
        realname?: string | undefined;
    } | undefined;
    /** 禅道服务器地址（客户端用于生成 Web 查看直链）。 */
    serverUrl?: string | undefined;
    /** 提示信息（如"配置缺 execution，任务视图为空"）。 */
    note?: string | undefined;
    error?: string | undefined;
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
export declare function createQueries(config: WorkspaceConfig, run?: (args: string[]) => Promise<unknown>): Queries;
/** 聚合两次查询；单边失败时另一边仍返回，并透出首个错误信息。 */
export declare function overviewData(config: WorkspaceConfig, queries: Queries, profileInfo?: CurrentProfileInfo | null): Promise<OverviewData>;
export interface LoginBody {
    server?: string;
    account?: string;
    password?: string;
    token?: string;
}
/** 由登录表单构造 CLI 参数；token 优先于 password。缺少必要字段返回 null。 */
export declare function buildLoginArgs(body: LoginBody): string[] | null;
type RunFn = (args: string[]) => Promise<unknown>;
/**
 * POST /__dsh-zentao__/login：面板登录入口。转发 zentao login（凭证经 CLI
 * 写入 dsh 用户目录的 zentao.json，不经由本层保存）。login 成功输出纯文本
 * 而非 JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
 */
export declare function registerLoginApi(ctx: Context, run?: RunFn): () => void;
/**
 * GET /__dsh-zentao__/file?id=<文件ID>：
 * 图片流代理端点。使用当前已登录凭证向禅道拉取文件二进制并直吐浏览器，
 * 解决浏览器同源保护、CORS 与鉴权导致 Bug 详情中图片无法展示的问题。
 */
export declare function registerFileApi(ctx: Context): () => void;
/**
 * GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&fresh=1]：
 * 读该工作区的 .dsh-zentao.json，按配置拉取任务与 Bug。缓存按工作区分键
 * （60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
 */
export declare function registerOverviewApi(ctx: Context, deps?: {
    readConfig?: typeof readWorkspaceConfig;
    run?: RunFn;
}): () => void;
export {};
//# sourceMappingURL=api.d.ts.map