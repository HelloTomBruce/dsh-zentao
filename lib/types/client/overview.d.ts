/**
 * 右侧栏禅道概览 Tab 面板的纯函数/类型部分：overview 响应的汇总逻辑。
 * 组件部分见 panel.tsx（vite 的 .js 后缀解析不覆盖 .tsx，纯函数必须放 .ts，
 * 且不能与 panel.tsx 同名以免 tsc 输出冲突）。
 */
export interface WorkspaceBinding {
    product?: number;
    project?: number;
    execution?: number;
}
export interface TaskRow {
    id: string | number;
    name: string;
    status: string;
    [k: string]: unknown;
}
export interface BugRow {
    id: string | number;
    title: string;
    status: string;
    [k: string]: unknown;
}
export interface OverviewResponse {
    tasks: TaskRow[];
    bugs: BugRow[];
    config?: WorkspaceBinding;
    unconfigured?: boolean;
    currentUser?: {
        account: string;
        realname?: string;
    };
    serverUrl?: string;
    note?: string;
    error?: string;
}
/** 汇总计数；未关闭 Bug（徽标用）单独统计。 */
export declare function overviewSummary(res: OverviewResponse): {
    tasks: number;
    bugs: number;
    openBugs: number;
} | {
    error: string;
    tasks: number;
    bugs: number;
    openBugs: number;
};
export type PanelTab = "tasks" | "bugs";
/** 一个筛选项：browse → --browse-type（服务端状态集）；filter → --filter（拉取范围内条件过滤）。 */
export interface FilterOption {
    key: string;
    label: string;
    browse?: string;
    filter?: string;
}
/**
 * 面板状态筛选选项。默认项不带参数，与现状一致（task list 的 CLI 默认
 * browseType 就是 unclosed）；状态明细项统一 browse=all + filter status=<x>
 * （避免服务端默认状态集与条件过滤相交导致空结果）。
 */
export declare const FILTER_OPTIONS: Record<PanelTab, readonly FilterOption[]>;
export declare const DEFAULT_FILTER_KEY: Record<PanelTab, string>;
/**
 * 由两个视图的筛选选择构造 overview 请求的查询串（不含 workspace 与前导 &）。
 * 未选（默认项）时不带参数；未知 key 回退到该视图默认项。
 */
export declare function buildOverviewQuery(taskSel: string, bugSel: string): string;
//# sourceMappingURL=overview.d.ts.map