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
 * 面板状态筛选选项（已按真实服务端行为校准）：
 * - tasks：本服务端（禅道 22.0 集群 + app=project 上下文）--browse-type 被静默忽略
 *   （unclosed 仍返回全部 2052 条），故全部状态项改走 --filter 表达式
 * - bugs：--browse-type 有效（unclosed 726→88），默认项用它；状态明细项
 *   统一 browse=all + filter（避免与服务端默认状态集相交导致空结果）
 */
export declare const FILTER_OPTIONS: Record<PanelTab, readonly FilterOption[]>;
export declare const DEFAULT_FILTER_KEY: Record<PanelTab, string>;
/** 优先级选项（tasks/bugs 通用；空 key = 不筛选）。 */
export declare const PRI_OPTIONS: readonly {
    key: string;
    label: string;
}[];
/** 严重程度选项（仅 Bug 视图；空 key = 不筛选）。 */
export declare const SEVERITY_OPTIONS: readonly {
    key: string;
    label: string;
}[];
/** 单个视图的完整筛选状态。 */
export interface TabFilterState {
    /** 状态选项 key（FILTER_OPTIONS）。 */
    status: string;
    /** 优先级（"" 不筛选）。 */
    pri: string;
    /** 严重程度（"" 不筛选；仅 bugs 使用）。 */
    severity: string;
    /** 关键词（"" 不搜索；回车确认后生效）。 */
    search: string;
}
export declare function defaultTabFilter(tab: PanelTab): TabFilterState;
/**
 * 由两个视图的筛选状态构造 overview 请求的查询串（不含 workspace 与前导 &）。
 * 状态选项的 filter 与 pri/severity 合并为一个逗号 AND 表达式；
 * search 经 encodeURIComponent 编码，空值不带参数。
 */
export declare function buildOverviewQuery(task: TabFilterState, bug: TabFilterState): string;
//# sourceMappingURL=overview.d.ts.map