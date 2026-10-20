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
//# sourceMappingURL=overview.d.ts.map