/**
 * 右侧栏禅道概览 Tab 面板的纯函数/类型部分（单视图数据模型 + 筛选查询串）。
 * 视图元数据（key/label/模块/fields/scope/筛选选项/详情支持）已单源化到
 * src/views.ts（server+client 共享），本文件只保留面板侧的数据模型与查询串构造。
 */

import { DEFAULT_FILTER_KEY as REGISTRY_DEFAULT_KEY, FILTER_OPTIONS as REGISTRY_FILTERS, type ViewKey, type WorkspaceBinding } from "../views.ts";

export type PanelTab = ViewKey;
export type WorkspaceBinding2 = WorkspaceBinding;
export {
  VIEWS as VIEW_REGISTRY,
  VIEW_KEYS as PANEL_TABS,
  DEFAULT_FILTER_KEY,
  FILTER_OPTIONS,
  PRI_OPTIONS,
  SEVERITY_OPTIONS,
  STORY_STAGE_MAP,
  CASE_TYPE_MAP,
} from "../views.ts";
import { VIEWS } from "../views.ts";
export { isViewKey } from "../views.ts";
export type { FilterOption, ViewKey, WorkspaceBinding } from "../views.ts";

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
  /** 显式 scope 覆盖生效后的完整配置（仅请求带 scope 参数时返回；面板回显生效范围）。 */
  effective?: WorkspaceBinding;
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

/** 单个视图的完整筛选状态。 */
export interface TabFilterState {
  status: string;
  pri: string;
  severity: string;
  search: string;
}

export function defaultTabFilter(tab: PanelTab): TabFilterState {
  return { status: REGISTRY_DEFAULT_KEY[tab], pri: "", severity: "", search: "" };
}

/**
 * 由单视图的筛选状态构造 overview 请求的筛选查询串
 * （browse/filter/search，不含 workspace 与 view）。
 * 状态选项的 filter 与 pri/severity 合并为一个逗号 AND 表达式。
 */
export function buildOverviewQuery(view: PanelTab, sel: TabFilterState): string {
  const options = REGISTRY_FILTERS[view];
  const opt = options.find((o) => o.key === sel.status) ?? options.find((o) => o.key === REGISTRY_DEFAULT_KEY[view]);
  const parts: string[] = [];
  if (opt?.browse !== undefined) parts.push(`browse=${encodeURIComponent(opt.browse)}`);
  const conditions = [opt?.filter];
  if (sel.pri !== "") conditions.push(`pri=${sel.pri}`);
  if (VIEWS[view].severityEnabled && sel.severity !== "") conditions.push(`severity=${sel.severity}`);
  const filter = conditions.filter((c): c is string => c !== undefined && c !== "").join(",");
  if (filter !== "") parts.push(`filter=${encodeURIComponent(filter)}`);
  const search = sel.search.trim();
  if (search !== "") parts.push(`search=${encodeURIComponent(search)}`);
  return parts.join("&");
}

/**
 * 旧格式兼容垫片：0.4.0 之前的服务端返回 {tasks, bugs} 双视图且无 view 字段。
 * 客户端升级早于宿主重启时（新客户端 + 旧服务端），把旧响应映射为单视图格式。
 * 宿主全量重启覆盖所有用户后可移除。
 */
export function normalizeOverview(raw: unknown, view: PanelTab): OverviewResponse {
  if (typeof raw !== "object" || raw === null) {
    return { view, rows: [], error: "响应格式异常" };
  }
  const r = raw as Partial<OverviewResponse> & { tasks?: OverviewRow[]; bugs?: OverviewRow[] };
  if (r.view !== undefined) return r as OverviewResponse;
  const legacy = r as { tasks?: OverviewRow[]; bugs?: OverviewRow[]; error?: string; unconfigured?: boolean };
  return {
    view,
    rows: view === "bugs" ? legacy.bugs ?? [] : legacy.tasks ?? [],
    ...(r.config !== undefined ? { config: r.config } : {}),
    ...(legacy.unconfigured !== undefined ? { unconfigured: legacy.unconfigured } : {}),
    ...(r.currentUser !== undefined ? { currentUser: r.currentUser } : {}),
    ...(r.serverUrl !== undefined ? { serverUrl: r.serverUrl } : {}),
    ...(r.note !== undefined ? { note: r.note } : {}),
    ...(legacy.error !== undefined ? { error: legacy.error } : {}),
  };
}

/* ---------- 范围选择器（手动选择产品/项目/执行，优先级高于文件绑定） ---------- */

/** 范围选择状态（字符串形态，"" = 未选 → 回落文件绑定）。 */
export interface ScopeSelection {
  product: string;
  project: string;
  execution: string;
}

export const EMPTY_SCOPE: ScopeSelection = { product: "", project: "", execution: "" };

/**
 * 按视图构造 scope 查询串——只发送与该视图相关的显式维度：
 * - tasks → 仅 execution（task 只认执行）
 * - bugs → product/project/execution 全发（服务端按 产品>项目>执行 取生效项，
 *   且显式项目/执行未选产品时会清除绑定产品，让手动选择生效）
 * - stories/testtasks/testcases → 仅 product（这些对象无执行/项目维度；
 *   若误发 execution，服务端会清除绑定 product 导致这些视图失去范围）
 */
export function buildScopeQuery(view: PanelTab, sel: ScopeSelection): string {
  const dims: readonly (keyof ScopeSelection)[] =
    view === "tasks" ? ["execution"]
    : view === "bugs" ? ["product", "project", "execution"]
    : ["product"];
  return dims
    .filter((k) => sel[k] !== "")
    .map((k) => `${k}=${encodeURIComponent(sel[k])}`)
    .join("&");
}

/** meta 端点（/__dsh-zentao__/meta/scopes）响应：范围选择器下拉数据源。 */
export interface ScopeOption {
  id: number | string;
  name?: string;
  status?: string;
  /** 执行所属项目（级联分组用；仅 executions 项）。 */
  project?: number | string;
}

export interface MetaScopesResponse {
  products?: ScopeOption[];
  projects?: ScopeOption[];
  executions?: ScopeOption[];
  errors?: { products?: string; projects?: string; executions?: string };
}

const SCOPE_STORAGE_PREFIX = "dsh-zentao:scope:";

/** 读取工作区记忆的范围选择（localStorage；非法内容安全回退为空选择）。 */
export function loadScopeSelection(workspacePath: string): ScopeSelection {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_PREFIX + workspacePath);
    if (raw === null) return EMPTY_SCOPE;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === "string" && /^\d+$/.test(v) ? v : "");
    return {
      product: str(parsed.product),
      project: str(parsed.project),
      execution: str(parsed.execution),
    };
  } catch {
    return EMPTY_SCOPE;
  }
}

/** 记忆范围选择（全空时删除键，回落纯绑定行为）。 */
export function saveScopeSelection(workspacePath: string, sel: ScopeSelection): void {
  try {
    const key = SCOPE_STORAGE_PREFIX + workspacePath;
    if (sel.product === "" && sel.project === "" && sel.execution === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(sel));
    }
  } catch { /* localStorage 不可用（隐私模式等）时静默降级为会话内状态 */ }
}
