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
  currentUser?: { account: string; realname?: string };
  serverUrl?: string;
  note?: string;
  error?: string;
}

/** 未关闭行数（标题栏未关闭 Bug 徽标用）。 */
export function openRowCount(rows: OverviewRow[]): number {
  return rows.filter((r) => r.status !== "closed").length;
}

/* ---------- 状态筛选（0.5.0 CLI 的 --browse-type / --filter 能力） ---------- */

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
export const FILTER_OPTIONS: Record<PanelTab, readonly FilterOption[]> = {
  tasks: [
    { key: "unclosed", label: "未关闭", filter: "status!=closed" },
    { key: "wait", label: "未开始", filter: "status=wait" },
    { key: "doing", label: "进行中", filter: "status=doing" },
    { key: "done", label: "已完成", filter: "status=done" },
    { key: "all", label: "全部" },
  ],
  bugs: [
    { key: "unclosed", label: "未关闭", browse: "unclosed" },
    { key: "active", label: "激活", browse: "all", filter: "status=active" },
    { key: "resolved", label: "已解决", browse: "all", filter: "status=resolved" },
    { key: "closed", label: "已关闭", browse: "all", filter: "status=closed" },
    { key: "all", label: "全部", browse: "all" },
  ],
  stories: [
    { key: "unclosed", label: "未关闭", filter: "status!=closed" },
    { key: "active", label: "激活", filter: "status=active" },
    { key: "reviewing", label: "评审中", filter: "status=reviewing" },
    { key: "closed", label: "已关闭", filter: "status=closed" },
    { key: "all", label: "全部" },
  ],
  // 测试单/用例：本部署 status 值为本地化中文（如「已关闭」）且 browse-type 被静默
  // 忽略，服务端状态筛选不可靠——只提供全部默认，状态徽标原样显示
  testtasks: [
    { key: "all", label: "全部" },
  ],
  testcases: [
    { key: "all", label: "全部" },
  ],
};

export const DEFAULT_FILTER_KEY: Record<PanelTab, string> = {
  tasks: FILTER_OPTIONS.tasks[0]?.key ?? "unclosed",
  bugs: FILTER_OPTIONS.bugs[0]?.key ?? "unclosed",
  stories: FILTER_OPTIONS.stories[0]?.key ?? "unclosed",
  testtasks: FILTER_OPTIONS.testtasks[0]?.key ?? "all",
  testcases: FILTER_OPTIONS.testcases[0]?.key ?? "all",
};

/** 用例类型（type）中文映射。 */
export const CASE_TYPE_MAP: Record<string, string> = {
  feature: "功能",
  performance: "性能",
  configuration: "配置",
  install: "安装部署",
  security: "安全",
  interface: "接口",
  unit: "单元",
  workflow: "流程",
  others: "其他",
};

/** 需求阶段（stage）中文映射：需求生命周期阶段，独立于 status。 */
export const STORY_STAGE_MAP: Record<string, string> = {
  planned: "已计划",
  projected: "已立项",
  developing: "开发中",
  developed: "开发完成",
  testing: "测试中",
  verified: "已验收",
  released: "已发布",
};

/* ---------- 第二维度筛选：优先级 / 严重程度 / 关键词 ---------- */

/** 优先级选项（tasks/bugs 通用；空 key = 不筛选）。 */
export const PRI_OPTIONS: readonly { key: string; label: string }[] = [
  { key: "", label: "全部优先级" },
  { key: "1", label: "P1" },
  { key: "2", label: "P2" },
  { key: "3", label: "P3" },
  { key: "4", label: "P4" },
];

/** 严重程度选项（仅 Bug 视图；空 key = 不筛选）。 */
export const SEVERITY_OPTIONS: readonly { key: string; label: string }[] = [
  { key: "", label: "全部级别" },
  { key: "1", label: "致命" },
  { key: "2", label: "严重" },
  { key: "3", label: "一般" },
  { key: "4", label: "轻微" },
];

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

export function defaultTabFilter(tab: PanelTab): TabFilterState {
  return { status: DEFAULT_FILTER_KEY[tab], pri: "", severity: "", search: "" };
}

/**
 * 由单视图的筛选状态构造 overview 请求的筛选查询串
 * （browse/filter/search，不含 workspace 与 view）。
 * 状态选项的 filter 与 pri/severity 合并为一个逗号 AND 表达式。
 */
export function buildOverviewQuery(view: PanelTab, sel: TabFilterState): string {
  const options = FILTER_OPTIONS[view];
  const opt = options.find((o) => o.key === sel.status) ?? options.find((o) => o.key === DEFAULT_FILTER_KEY[view]);
  const parts: string[] = [];
  if (opt?.browse !== undefined) parts.push(`browse=${encodeURIComponent(opt.browse)}`);
  const conditions = [opt?.filter];
  if (sel.pri !== "") conditions.push(`pri=${sel.pri}`);
  if (view === "bugs" && sel.severity !== "") conditions.push(`severity=${sel.severity}`);
  const filter = conditions.filter((c): c is string => c !== undefined && c !== "").join(",");
  if (filter !== "") parts.push(`filter=${encodeURIComponent(filter)}`);
  const search = sel.search.trim();
  if (search !== "") parts.push(`search=${encodeURIComponent(search)}`);
  return parts.join("&");
}
