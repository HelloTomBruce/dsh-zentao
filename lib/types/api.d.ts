/**
 * /__dsh-zentao__/overview 数据端点：按工作区绑定配置（<工作区>/.dsh-zentao.json）
 * 聚合"该工作区所属执行的任务 + 所属范围的 Bug"两个视图，供客户端面板
 * fetch。数据经 zentao CLI 子进程获取（凭证由 CLI 内部管理），同源路由，
 * 不暴露任何凭证。登录端点与配置见文件末尾。
 */
import type { IncomingMessage } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { type CurrentProfileInfo } from "./lib/config.ts";
import { readWorkspaceConfig, type WorkspaceConfig } from "./lib/workspace-config.ts";
export declare const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export declare const LOGIN_PATH = "/__dsh-zentao__/login";
export declare const FILE_PATH = "/__dsh-zentao__/file";
export interface OverviewRow {
    id: string | number;
    /** 标题字段：任务行用 name，bug/需求/用例行用 title（CLI 原样透传，两者都可能出现）。 */
    name?: string;
    title?: string;
    status: string;
    [key: string]: unknown;
}
/** 概览视图（TASK-009 起按视图懒加载；后续任务扩展 stories/testcases/testtasks）。 */
export type OverviewView = "tasks" | "bugs";
export declare const OVERVIEW_VIEWS: readonly OverviewView[];
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
/**
 * 集群负载均衡容错：个别后端节点异常时——① 回退返回其他 execution 的数据
 * （数据形状检查，仅 tasks 用 expectExecution）；② 翻页中途报「服务端分页未
 * 向前推进」（瞬时错误，--all 多页拉取放大了命中概率）——自动重试命中正常
 * 节点，最多 3 次；其他错误（如未登录 1006）不重试直接抛。
 */
export declare function fetchWithNodeRetry(run: () => Promise<unknown>, expectExecution?: number): Promise<unknown>;
/**
 * 面板表格实际渲染的列（panel.tsx 卡片/表格共同用到的字段）。
 * overview 查询用 --fields 裁剪到这些列，降低子进程传输与序列化开销。
 * 未知字段会被 CLI 静默丢弃（实测），故裁剪是安全的。导出供测试共享单一事实源。
 */
export declare const TASK_PANEL_FIELDS = "id,name,status,pri,deadline,assignedTo,assignedToRealName,openedBy,execution";
export declare const BUG_PANEL_FIELDS = "id,title,status,pri,severity,deadline,assignedTo,assignedToRealName,openedBy";
/** 面板筛选（单视图作用域，经查询参数传入，白名单校验后拼入 CLI 参数）。 */
export interface PanelFilters {
    browse?: string;
    filter?: string;
    search?: string;
}
export type ViewQueryFn = () => Promise<unknown>;
/**
 * 按工作区配置与视图构造单条 CLI 查询（zentao-cli ≥ 0.5.0 命令面）：
 * `<module> list <scope> --fields=<面板列> [--browse-type/--filter/--search] --page-size=200 --all`
 * 默认 run 解包 runZentao 的 {data, meta}，只取 data；scope 缺失返回 null（调用方给 note）。
 */
export declare function createViewQuery(config: WorkspaceConfig, view: OverviewView, filters?: PanelFilters, run?: (args: string[]) => Promise<unknown>): ViewQueryFn | null;
/** 单视图查询聚合：失败透出错误信息，scope 缺失给 note。 */
export declare function overviewViewData(config: WorkspaceConfig, view: OverviewView, query: ViewQueryFn | null, profileInfo?: CurrentProfileInfo | null): Promise<OverviewViewData>;
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
 * 解析面板筛选参数（browse/filter/search，单视图作用域）。
 * 返回 null 表示存在非法参数（调用方应 400）；全部缺省返回 {}。
 * search 允许任意非控字符（含中文），仅拒绝 - 开头（防 CLI flag 注入）与超长。
 */
export declare function panelFiltersOf(req: IncomingMessage): PanelFilters | null;
/** 解析视图参数：缺省 tasks；不在白名单返回 null（调用方 400）。 */
export declare function overviewViewOf(req: IncomingMessage): OverviewView | null;
/**
 * GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&view=tasks|bugs][&fresh=1]：
 * 读该工作区的 .dsh-zentao.json，按配置拉取**单个视图**的数据（面板切 Tab 懒加载）。
 * 缓存按 工作区+视图+筛选 分键（60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
 */
export declare function registerOverviewApi(ctx: Context, deps?: {
    readConfig?: typeof readWorkspaceConfig;
    run?: RunFn;
}): () => void;
export {};
//# sourceMappingURL=api.d.ts.map