/**
 * /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
 * 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
 * 内部管理）。同源路由，不暴露任何凭证。
 */
import type { Context } from "@deepseek-ai/cordis";
export declare const OVERVIEW_PATH = "/__dsh-zentao__/overview";
export declare const LOGIN_PATH = "/__dsh-zentao__/login";
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
/**
 * 聚合三次查询。注入 queries 便于测试；默认实现：
 * - bugs: `bug --product=<p>` 逐个产品拉取（本项目产品 id 2..22）
 * - projects: `project --recPerPage=200` 后按 status=doing 过滤
 * - tasks: 无全局入口，返回空（CLI 局限），面板展示"任务视图需指定执行"
 */
export declare function overviewData(queries?: Queries): Promise<OverviewData>;
/** 默认查询实现：projects 全量过滤；bugs 按产品并行拉取（并发上限 6）。 */
export declare function createDefaultQueries(productIds: readonly number[]): Queries;
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
 * 写入插件目录的 zentao.json，不经由本层保存）。login 成功输出纯文本而非
 * JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
 */
export declare function registerLoginApi(ctx: Context, run?: RunFn): () => void;
export declare function registerOverviewApi(ctx: Context): () => void;
export {};
//# sourceMappingURL=api.d.ts.map