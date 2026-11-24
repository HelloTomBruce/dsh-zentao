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
  currentUser?: { account: string; realname?: string };
  serverUrl?: string;
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

/* ---------- 状态筛选（0.5.0 CLI 的 --browse-type / --filter 能力） ---------- */

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
export const FILTER_OPTIONS: Record<PanelTab, readonly FilterOption[]> = {
  tasks: [
    { key: "unclosed", label: "未关闭" },
    { key: "wait", label: "未开始", browse: "all", filter: "status=wait" },
    { key: "doing", label: "进行中", browse: "all", filter: "status=doing" },
    { key: "done", label: "已完成", browse: "all", filter: "status=done" },
    { key: "all", label: "全部", browse: "all" },
  ],
  bugs: [
    { key: "default", label: "未关闭" },
    { key: "active", label: "激活", browse: "all", filter: "status=active" },
    { key: "resolved", label: "已解决", browse: "all", filter: "status=resolved" },
    { key: "closed", label: "已关闭", browse: "all", filter: "status=closed" },
    { key: "all", label: "全部", browse: "all" },
  ],
};

export const DEFAULT_FILTER_KEY: Record<PanelTab, string> = {
  tasks: FILTER_OPTIONS.tasks[0]?.key ?? "unclosed",
  bugs: FILTER_OPTIONS.bugs[0]?.key ?? "default",
};

/**
 * 由两个视图的筛选选择构造 overview 请求的查询串（不含 workspace 与前导 &）。
 * 未选（默认项）时不带参数；未知 key 回退到该视图默认项。
 */
export function buildOverviewQuery(taskSel: string, bugSel: string): string {
  const parts: string[] = [];
  const apply = (tab: PanelTab, sel: string, prefix: "task" | "bug"): void => {
    const options = FILTER_OPTIONS[tab];
    const opt = options.find((o) => o.key === sel) ?? options.find((o) => o.key === DEFAULT_FILTER_KEY[tab]);
    if (opt?.browse !== undefined) parts.push(`${prefix}Browse=${encodeURIComponent(opt.browse)}`);
    if (opt?.filter !== undefined) parts.push(`${prefix}Filter=${encodeURIComponent(opt.filter)}`);
  };
  apply("tasks", taskSel, "task");
  apply("bugs", bugSel, "bug");
  return parts.join("&");
}
