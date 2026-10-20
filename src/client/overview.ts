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
  note?: string;
  error?: string;
}

/** 汇总计数；未关闭 Bug（徽标用）单独统计。 */
export function overviewSummary(res: OverviewResponse) {
  const tasks = Array.isArray(res.tasks) ? res.tasks.length : 0;
  const bugs = Array.isArray(res.bugs) ? res.bugs : [];
  const openBugs = bugs.filter((b) => b.status !== "closed").length;
  const base = { tasks, bugs: bugs.length, openBugs };
  return res.error !== undefined ? { ...base, error: res.error } : base;
}
