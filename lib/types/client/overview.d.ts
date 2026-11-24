/**
 * 右侧栏禅道概览 Tab 面板的纯函数/类型部分：单视图数据模型与筛选查询串构造。
 * 组件部分见 panel.tsx（vite 的 .js 后缀解析不覆盖 .tsx，纯函数必须放 .ts，
 * 且不能与 panel.tsx 同名以免 tsc 输出冲突）。
 *
 * 架构（TASK-009 起）：overview 端点按 view 参数返回**单视图**数据
 * {view, rows, ...}，面板切 Tab 才拉对应视图（懒加载 + 服务端按视图缓存）。
 */
/** 视图 key。 */
export type PanelTab = "tasks" | "bugs" | "stories" | "testtasks" | "testcases";
export interface WorkspaceBinding {
    product?: number;
    project?: number;
    execution?: number;
    /** 可选执行列表（多执行绑定，任务视图切换下拉）。 */
    executions?: number[];
}
/** 单视图数据行：任务用 name、Bug/需求/用例用 title（CLI 原样透传）。 */
export interface OverviewRow {
    id: string | number;
    name?: string;
    title?: string;
    status?: string;
    [k: string]: unknown;
}
/** overview 端点响应（单视图）。 */
export interface OverviewResponse {
    view: PanelTab;
    rows: OverviewRow[];
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
/** 未关闭行数（标题栏未关闭 Bug 徽标用）。 */
export declare function openRowCount(rows: OverviewRow[]): number;
/** 一个筛选项：browse → --browse-type（服务端状态集）；filter → --filter（拉取范围内条件过滤）。 */
export interface FilterOption {
    key: string;
    label: string;
    browse?: string;
    filter?: string;
}
/**
 * 面板状态筛选选项（已按真实服务端行为校准）：
 * - tasks/stories：本服务端对这两类 list 的 --browse-type 无效（tasks 被静默
 *   忽略、story 直接不支持），全部状态项走 --filter 表达式
 * - bugs：--browse-type 有效（unclosed 726→88），默认项用它；状态明细项
 *   统一 browse=all + filter（避免与服务端默认状态集相交导致空结果）
 */
export declare const FILTER_OPTIONS: Record<PanelTab, readonly FilterOption[]>;
export declare const DEFAULT_FILTER_KEY: Record<PanelTab, string>;
/** 用例类型（type）中文映射。 */
export declare const CASE_TYPE_MAP: Record<string, string>;
/** 需求阶段（stage）中文映射：需求生命周期阶段，独立于 status。 */
export declare const STORY_STAGE_MAP: Record<string, string>;
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
 * 由单视图的筛选状态构造 overview 请求的筛选查询串
 * （browse/filter/search，不含 workspace 与 view）。
 * 状态选项的 filter 与 pri/severity 合并为一个逗号 AND 表达式。
 */
export declare function buildOverviewQuery(view: PanelTab, sel: TabFilterState): string;
//# sourceMappingURL=overview.d.ts.map