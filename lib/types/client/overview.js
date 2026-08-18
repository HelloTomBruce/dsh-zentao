/**
 * 侧栏底部禅道面板的纯函数/类型部分：overview 响应的汇总逻辑。
 * 组件部分见 panel.tsx（vite 的 .js 后缀解析不覆盖 .tsx，纯函数必须放 .ts，
 * 且不能与 panel.tsx 同名以免 tsc 输出冲突）。
 */
export function overviewSummary(res) {
    const base = {
        tasks: Array.isArray(res.myTasks) ? res.myTasks.length : 0,
        bugs: Array.isArray(res.myBugs) ? res.myBugs.length : 0,
        projects: Array.isArray(res.activeProjects) ? res.activeProjects.length : 0,
    };
    return res.error !== undefined ? { ...base, error: res.error } : base;
}
//# sourceMappingURL=overview.js.map