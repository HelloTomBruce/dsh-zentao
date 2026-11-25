/**
 * 右侧侧边栏"禅道概览"Tab 面板（sidebar.right.pane.tab / .title 插槽，
 * 入口注册见 index.ts）。按当前工作区的 .dsh-zentao.json 绑定配置展示
 * 该执行下的任务与该范围内的 Bug，数据来自同源
 * /__dsh-zentao__/overview?workspace=<工作区路径>。纯函数/类型见
 * overview.ts 与 workspace.ts。
 */
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import type { MetaScopesResponse, OverviewResponse, PanelTab, ScopeOption, ScopeSelection, TabFilterState, WorkspaceBinding } from "./overview.ts";
import { buildOverviewQuery, buildScopeQuery, CASE_TYPE_MAP, defaultTabFilter, FILTER_OPTIONS, loadScopeSelection, normalizeOverview, openRowCount, PRI_OPTIONS, saveScopeSelection, SEVERITY_OPTIONS, STORY_STAGE_MAP } from "./overview.ts";
import { useActiveWorkspace } from "./workspace.ts";
import { ZentaoTabIcon } from "./icons.tsx";
import { T } from "./theme.ts";
import { PriBadge, StatusBadge } from "./badges.tsx";
import { DetailView } from "./detail-view.tsx";
export { sanitizeAndFormatHtml } from "./sanitize.ts";

const OVERVIEW_URL = "/__dsh-zentao__/overview";
const META_SCOPES_URL = "/__dsh-zentao__/meta/scopes";
const LOGIN_URL = "/__dsh-zentao__/login";
const LOGOUT_URL = "/__dsh-zentao__/logout";
const CONFIG_FILENAME = ".dsh-zentao.json";
const CONFIG_SAMPLE = '{ "product": 2, "execution": 168 }';

function useOverview(workspacePath: string, view: PanelTab, filterQuery: string, scopeQuery: string): { data: OverviewResponse | null; refresh: () => void; loading: boolean } {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  // fresh=1 仅对「显式 refresh 后的下一次请求」生效——登录/刷新后的常规切 Tab/改筛选仍走服务端缓存
  const bypassOnceRef = useRef(false);
  useEffect(() => {
    if (workspacePath === "") return;
    let alive = true;
    setLoading(true);
    // 按视图懒加载：切 Tab 换 view 即拉对应视图（服务端按 工作区+视图+scope+筛选 缓存）。
    const scope = scopeQuery !== "" ? `&${scopeQuery}` : "";
    const fresh = bypassOnceRef.current ? "&fresh=1" : "";
    bypassOnceRef.current = false;
    const url = `${OVERVIEW_URL}?workspace=${encodeURIComponent(workspacePath)}&view=${view}${scope}&${filterQuery}${fresh}`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<unknown> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((raw) => { if (alive) setData(normalizeOverview(raw, view)); })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error && /^HTTP /.test(err.message) ? err.message : "网络错误";
        setData({ view, rows: [], error: message });
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nonce, workspacePath, view, filterQuery, scopeQuery]);
  return { data, refresh: () => { bypassOnceRef.current = true; setNonce((n) => n + 1); }, loading };
}

/** 范围选择器下拉数据源（meta 端点，服务端 60s 缓存）。 */
function useMetaScopes(): MetaScopesResponse | null {
  const [meta, setMeta] = useState<MetaScopesResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(META_SCOPES_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<MetaScopesResponse> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (alive) setMeta(data); })
      .catch(() => { /* 下拉数据源失败不阻塞面板——选择器为空，仅范围选择不可用 */ });
    return () => { alive = false; };
  }, []);
  return meta;
}

const PAGE_SIZE = 15;

/** 视图内容：行卡片列表，支持分页与点击查看详情。 */
function RowList({
  rows,
  nameKey,
  type,
  page,
  onPageChange,
  onSelect,
}: {
  rows: Array<Record<string, unknown>>;
  nameKey: "name" | "title";
  type: TabKey;
  page: number;
  onPageChange: (newPage: number) => void;
  onSelect: (row: Record<string, unknown>) => void;
}) {
  if (rows.length === 0) {
    return createElement("div", { style: emptyStyle }, "暂无匹配数据");
  }

  const isTask = type === "tasks";
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const currentSlice = rows.slice(start, start + PAGE_SIZE);

  return createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
    ...currentSlice.map((row, i) => {
      const title = String(row[nameKey] ?? row.id);
      const assigned = String(row.assignedToRealName ?? row.assignedTo ?? row.owner ?? "未指派");
      const status = String(row.status ?? "");
      const deadline = row.deadline ? String(row.deadline) : undefined;
      const metaExtra = isTask
        ? (row.estimate !== undefined && row.estimate !== null && row.estimate !== "" ? `${row.estimate}h` : undefined)
        : type === "stories"
          ? (row.stage !== undefined && row.stage !== "" ? STORY_STAGE_MAP[String(row.stage)] ?? String(row.stage) : undefined)
          : type === "testtasks"
            ? [row.begin, row.end].filter((d) => d !== undefined && d !== "").map(String).join("~") || undefined
            : type === "testcases"
              ? (row.type !== undefined && row.type !== "" ? CASE_TYPE_MAP[String(row.type)] ?? String(row.type) : undefined)
              : (row.severity ? `严重: ${row.severity}` : undefined);

      return createElement("div", {
        key: String(row.id ?? `${safePage}-${i}`),
        onClick: () => onSelect(row),
        style: rowCardStyle,
      },
        createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
          createElement("div", { style: { display: "flex", alignItems: "center", minWidth: 0, flex: 1, gap: "4px" } },
            createElement("span", { style: idTagStyle }, `#${row.id}`),
            createElement(PriBadge, { pri: row.pri }),
            createElement("span", { style: rowTitleStyle, title }, title),
          ),
          createElement(StatusBadge, { status }),
        ),
        createElement("div", { style: rowMetaStyle },
          createElement("span", null, `👤 ${assigned}`),
          deadline && createElement("span", null, `📅 ${deadline}`),
          metaExtra && createElement("span", null, isTask ? `⏱️ ${metaExtra}` : type === "stories" ? `📌 ${metaExtra}` : type === "testtasks" ? `📅 ${metaExtra}` : type === "testcases" ? `🏷️ ${metaExtra}` : `🔥 ${metaExtra}`),
          createElement("span", { style: { marginLeft: "auto", color: T.accent, fontSize: "11px" } }, "详情 →"),
        ),
      );
    }),
    totalPages > 1 && createElement("div", { style: paginationBarStyle },
      createElement("button", {
        disabled: safePage <= 1,
        onClick: () => onPageChange(Math.max(1, safePage - 1)),
        style: pageBtnStyle(safePage <= 1),
      }, "上一页"),
      createElement("span", { style: pageInfoStyle }, `第 ${safePage} / ${totalPages} 页（共 ${rows.length} 条）`),
      createElement("button", {
        disabled: safePage >= totalPages,
        onClick: () => onPageChange(Math.min(totalPages, safePage + 1)),
        style: pageBtnStyle(safePage >= totalPages),
      }, "下一页"),
    ),
  );
}

const sectionTitleStyle: CSSProperties = {
  fontSize: "12px", fontWeight: "600", color: T.textSecondary,
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
};
const emptyStyle: CSSProperties = {
  padding: "10px", color: T.textSecondary, fontSize: "13px",
  border: `1px dashed ${T.border}`, borderRadius: "6px", textAlign: "center",
};
const hintStyle: CSSProperties = {
  fontSize: "12px", color: T.textSecondary,
  whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6,
};
const codeStyle: CSSProperties = {
  display: "block", margin: "6px 0", padding: "8px 10px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px",
  background: T.surfaceMuted, border: `1px solid ${T.border}`,
  borderRadius: "6px", whiteSpace: "pre-wrap", wordBreak: "break-all",
};

function LoginField({ label, value, set, placeholder, type = "text" }: {
  label: string; value: string; set: (v: string) => void; placeholder?: string; type?: string;
}) {
  return createElement("label", { style: loginFieldStyle },
    createElement("span", { style: loginLabelStyle }, label),
    createElement("input", {
      type, value, placeholder,
      onChange: (e: ChangeEvent<HTMLInputElement>) => set(e.target.value),
      style: loginInputStyle,
    }),
  );
}

/** 面板内登录表单：提交到同源 /__dsh-zentao__/login，结果（成功/失败原因）显式显示。 */
function LoginForm({ onLoggedIn, onClose }: { onLoggedIn: () => void; onClose?: (() => void) | undefined }) {
  const [server, setServer] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const submit = () => {
    if (pending) return;
    setPending(true);
    setError(null);
    fetch(LOGIN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ server, account, password: password || undefined, token: token || undefined }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; error?: string }>)
      .then((d) => {
        if (d.ok === true) {
          // 成功：显式展示结果再回调刷新（数据量较大，刷新要数秒——告知用户）
          setSuccess(true);
          onLoggedIn();
        } else {
          setError(d.error ?? "登录失败");
        }
      })
      .catch(() => setError("网络错误"))
      .finally(() => setPending(false));
  };
  // 成功态：结果明确可见，表单替换为成功提示（可手动关闭）
  if (success) {
    return createElement("div", null,
      createElement("div", { style: sectionTitleStyle }, "登录禅道"),
      createElement("div", { style: loginSuccessStyle }, "✓ 登录成功，正在刷新数据（数据量较大时约需几秒）…"),
      onClose !== undefined && createElement("button", { onClick: onClose, style: reloginLinkStyle }, "收起"),
    );
  }
  return createElement("div", null,
    createElement("div", { style: sectionTitleStyle }, "登录禅道"),
    createElement(LoginField, { label: "服务地址", value: server, set: setServer, placeholder: "http://zentao.example.com" }),
    createElement(LoginField, { label: "账号", value: account, set: setAccount }),
    createElement(LoginField, { label: "密码", value: password, set: setPassword, type: "password" }),
    createElement(LoginField, { label: "Token（选填，优先于密码）", value: token, set: setToken }),
    error !== null && createElement("div", { style: loginErrorStyle }, error),
    createElement("button", { onClick: submit, disabled: pending, style: loginSubmitStyle(pending) },
      pending ? "登录中…" : "登录"),
  );
}

const loginFieldStyle: CSSProperties = { display: "block", marginBottom: "8px" };
const loginLabelStyle: CSSProperties = {
  display: "block", fontSize: "12px", color: T.textSecondary, marginBottom: "3px",
};
const loginInputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: "13px",
  border: `1px solid ${T.border}`, borderRadius: "6px",
  background: T.surface, color: "inherit",
};
const loginErrorStyle: CSSProperties = {
  fontSize: "12px", color: T.danger, margin: "4px 0 8px",
  whiteSpace: "pre-wrap", wordBreak: "break-all",
};

/** 登录成功提示：绿色对勾文案，明确告知后续行为。 */
const loginSuccessStyle: CSSProperties = {
  fontSize: "12px", color: T.success, margin: "4px 0 10px", fontWeight: 600,
};
const loginSubmitStyle = (pending: boolean): CSSProperties => ({
  width: "100%", padding: "7px 0", fontSize: "13px", fontWeight: "600",
  border: "none", borderRadius: "6px", cursor: pending ? "default" : "pointer",
  background: T.accent, color: "#fff", opacity: pending ? 0.7 : 1,
});

type TabKey = "tasks" | "bugs" | "stories" | "testtasks" | "testcases";

/** Tab 标题栏：图标 + 标题 + 未关闭 Bug 计数徽标（默认未关闭筛选，数据走服务端 60s 缓存）。 */
export function ZentaoPanelTitle() {
  const workspace = useActiveWorkspace();
  const { data } = useOverview(workspace.path, "bugs", buildOverviewQuery("bugs", defaultTabFilter("bugs")), "");
  const openBugs = data !== null && data.view === "bugs" && data.error === undefined ? openRowCount(data.rows) : 0;
  return createElement("span", { style: titleWrapperStyle },
    createElement(ZentaoTabIcon, { style: { marginRight: 6 } }),
    createElement("span", null, "禅道概览"),
    openBugs > 0 &&
      createElement("span", { style: countBadgeStyle, title: "未关闭 Bug" }, String(openBugs)),
  );
}

const titleWrapperStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 0,
};
const countBadgeStyle: CSSProperties = {
  marginLeft: 6, padding: "0 6px", borderRadius: 999,
  fontSize: 11, fontWeight: 600, lineHeight: "16px",
  background: T.accent, color: "#fff",
};

/** 未配置工作区绑定的引导态：优先给范围选择器（选完即查，无需配置文件），附文件固化说明。 */
function UnconfiguredGuide({ workspace, onRefresh, scopeProps }: {
  workspace: { path: string; title: string };
  onRefresh: () => void;
  /** ScopeBar 的完整 props（面板态直接复用，选择即查询）。 */
  scopeProps: Parameters<typeof ScopeBar>[0];
}) {
  return createElement("div", { style: paneWrapperStyle },
    createElement("div", { style: sectionTitleStyle }, `工作区 ${workspace.title}`),
    createElement("div", { style: hintStyle },
      "当前工作区尚未绑定禅道对象。直接在下方选择范围即可查看数据（选择会按工作区记住）："),
    createElement(ScopeBar, scopeProps),
    createElement("div", { style: { height: "14px" } }),
    createElement("div", { style: hintStyle },
      "如需固化绑定，可在工作区根目录创建 ",
      createElement("code", null, CONFIG_FILENAME),
      `（声明所属的产品 / 执行 / 项目），团队成员克隆仓库后即自动生效：`),
    createElement("code", { style: codeStyle }, `${workspace.path}/${CONFIG_FILENAME}\n${CONFIG_SAMPLE}`),
    createElement("div", { style: { height: "10px" } }),
    createElement("button", { onClick: onRefresh, style: reloginLinkStyle }, "重新加载"),
  );
}

/** 骨架屏 shimmer 动画（<style> 注入；inline style 无法写 keyframes）。 */
const SKELETON_CSS = `
@keyframes dshZentaoShimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
.dsh-zentao-skeleton {
  position: relative; overflow: hidden;
  background: ${T.skeleton};
  border-radius: ${T.radiusXs};
}
.dsh-zentao-skeleton::after {
  content: ""; position: absolute; inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: dshZentaoShimmer 1.4s infinite;
}
@media (prefers-color-scheme: dark) {
  .dsh-zentao-skeleton::after {
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  }
}
`;

/** 骨架条：单个占位块（shimmer 扫光）。 */
function SkeletonBar({ width, height, style }: { width: string; height: string; style?: CSSProperties | undefined }) {
  return createElement("div", {
    className: "dsh-zentao-skeleton",
    style: { width, height, ...(style ?? {}) },
  });
}

/** 骨架屏：加载占位（可选过滤栏 + 卡片行结构，token 驱动）。 */
function SkeletonRows({ rows, tab, filterBar = true }: { rows: number; tab: TabKey; filterBar?: boolean | undefined }) {
  return createElement("div", { role: "status", "aria-label": "数据加载中" },
    createElement("style", null, SKELETON_CSS),
    // 过滤栏占位（与真实控件同高 28px，切换时布局不跳）
    filterBar && createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "12px" } },
      createElement(SkeletonBar, { width: "86px", height: "26px" }),
      createElement(SkeletonBar, { width: "86px", height: "26px" }),
      tab === "bugs" && createElement(SkeletonBar, { width: "86px", height: "26px" }),
      createElement(SkeletonBar, { width: "130px", height: "26px" })),
    // 卡片行占位（宽度错列，接近真实标题长度分布）
    ...Array.from({ length: rows }, (_, i) =>
      createElement("div", {
        key: i,
        style: {
          display: "flex", flexDirection: "column", gap: "7px",
          padding: "12px", marginBottom: "8px",
          border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusSm,
        },
      },
        createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          createElement(SkeletonBar, { width: "44px", height: "14px" }),
          createElement(SkeletonBar, { width: `${52 + ((i * 17) % 30)}%`, height: "14px" })),
        createElement(SkeletonBar, { width: "36%", height: "11px" }))),
  );
}

/** 范围项名称回显：优先名称，缺失时退回 #id。 */
function scopeNameOf(list: ScopeOption[], id: number | string | undefined): string {
  if (id === undefined) return "";
  const hit = list.find((o) => String(o.id) === String(id));
  return hit?.name !== undefined && hit.name !== "" ? `${hit.name} (#${id})` : `#${id}`;
}

/** 当前视图实际查询的范围文案（显式选择优先，回落文件绑定；与 effectiveConfigOf 服务端语义一致）。 */
function effectiveScopeText(tab: TabKey, eff: WorkspaceBinding | undefined, products: ScopeOption[], projects: ScopeOption[], executions: ScopeOption[]): string {
  if (eff === undefined) return "";
  if (tab === "tasks") return eff.execution !== undefined ? `执行 ${scopeNameOf(executions, eff.execution)}` : "";
  if (tab === "bugs") {
    if (eff.product !== undefined) return `产品 ${scopeNameOf(products, eff.product)}`;
    if (eff.project !== undefined) return `项目 ${scopeNameOf(projects, eff.project)}`;
    if (eff.execution !== undefined) return `执行 ${scopeNameOf(executions, eff.execution)}`;
    return "";
  }
  return eff.product !== undefined ? `产品 ${scopeNameOf(products, eff.product)}` : "";
}

/** 当前视图响应的范围维度（与 buildScopeQuery 的发送维度一致）。 */
function scopeDimsOf(tab: TabKey): readonly ("product" | "project" | "execution")[] {
  return tab === "tasks" ? ["execution"] : tab === "bugs" ? ["product", "project", "execution"] : ["product"];
}

/** 范围选择行：产品 / 项目→执行 级联下拉（数据来自 meta 端点；空选项 = 回落文件绑定，标签显示绑定值）。
 *  生效规则：任务视图响应执行；Bug 视图响应任一（服务端 产品>项目>执行，显式项目/执行会清除绑定产品）；
 *  需求/测试单/用例只响应产品。 */
function ScopeBar({ tab, sel, onChange, meta, binding, effective, disabled }: {
  tab: TabKey;
  sel: ScopeSelection;
  onChange: (patch: Partial<ScopeSelection>) => void;
  meta: MetaScopesResponse | null;
  /** 文件绑定（空选项标签与生效范围回显的回落源）。 */
  binding: WorkspaceBinding | undefined;
  /** 服务端生效范围回显（显式覆盖时与选择解耦的真实查询范围）。 */
  effective: WorkspaceBinding | undefined;
  disabled?: boolean | undefined;
}) {
  const products = useMemo(() => (meta?.products ?? []), [meta]);
  const projects = useMemo(() => (meta?.projects ?? []), [meta]);
  const allExecutions = useMemo(() => (meta?.executions ?? []), [meta]);
  // 级联：选中项目后执行列表过滤到该项目下
  const executions = useMemo(
    () => (sel.project === "" ? allExecutions : allExecutions.filter((e) => String(e.project ?? "") === sel.project)),
    [allExecutions, sel.project],
  );
  const nameOf = scopeNameOf;
  const closedMark = (o: ScopeOption): string => (o.status === "closed" ? "（已关闭）" : "");
  const optionEl = (o: ScopeOption) =>
    createElement("option", { key: String(o.id), value: String(o.id) }, `${nameOf([o], o.id)}${closedMark(o)}`);
  const emptyOption = (label: string) => createElement("option", { key: "", value: "" }, label);

  // 生效范围回显（当前视图实际查询的范围：显式选择优先，回落绑定）
  const effText = effectiveScopeText(tab, effective ?? binding, products, projects, allExecutions);

  // 视图无关维度禁用：需求/测试单/用例仅按产品筛选（无执行/项目归属维度）
  const noProjectDim = tab !== "tasks" && tab !== "bugs";
  const noExecutionDim = tab !== "tasks" && tab !== "bugs";

  return createElement("div", { style: scopeBarStyle },
    createElement("select", {
      value: sel.product,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange({ product: e.target.value }),
      style: filterSelectStyle,
      "aria-label": "产品范围",
      title: "产品（需求 / 测试单 / 用例 / Bug 的范围）",
      disabled,
    },
      emptyOption(binding?.product !== undefined ? `产品：默认 · ${nameOf(products, binding.product)}` : "产品：全部（未选）"),
      ...products.map(optionEl)),
    createElement("select", {
      value: sel.project,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange({ project: e.target.value }),
      style: { ...filterSelectStyle, ...(noProjectDim ? { opacity: 0.5 } : {}) },
      "aria-label": "项目范围",
      title: noProjectDim ? "该视图仅按产品筛选" : "项目（级联过滤执行列表；Bug 可按项目查）",
      disabled: disabled || noProjectDim,
    },
      emptyOption(binding?.project !== undefined ? `项目：默认 · ${nameOf(projects, binding.project)}` : "项目：全部（未选）"),
      ...projects.map(optionEl)),
    createElement("select", {
      value: sel.execution,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange({ execution: e.target.value }),
      style: { ...filterSelectStyle, ...(noExecutionDim ? { opacity: 0.5 } : {}) },
      "aria-label": "执行范围",
      title: noExecutionDim ? "该视图仅按产品筛选" : "执行（任务视图的范围；Bug 可按执行查）",
      disabled: disabled || noExecutionDim,
    },
      emptyOption(binding?.execution !== undefined ? `执行：默认 · ${nameOf(allExecutions, binding.execution)}` : "执行：全部（未选）"),
      ...executions.map(optionEl)),
    effText !== "" && createElement("span", { style: scopeEffectiveStyle, title: "当前视图实际查询的范围（显式选择优先于文件绑定）" }, `生效：${effText}`),
    meta?.errors !== undefined && createElement("span", { style: scopeErrorStyle, title: Object.values(meta.errors).join("；") }, "范围列表加载不完整"),
  );
}

/** 范围摘要行（紧凑单行，替代常驻三下拉）：显示当前生效范围 + 「修改」入口。 */
function ScopeSummary({ tab, sel, meta, binding, effective, disabled, onOpen }: {
  tab: TabKey;
  sel: ScopeSelection;
  meta: MetaScopesResponse | null;
  binding: WorkspaceBinding | undefined;
  effective: WorkspaceBinding | undefined;
  disabled?: boolean | undefined;
  onOpen: () => void;
}) {
  const products = meta?.products ?? [];
  const projects = meta?.projects ?? [];
  const executions = meta?.executions ?? [];
  const effText = effectiveScopeText(tab, effective ?? binding, products, projects, executions);
  // 显式选择的维度（仅当前视图响应的维度参与摘要）
  const manualParts: string[] = [];
  for (const d of scopeDimsOf(tab)) {
    const v = sel[d];
    if (v === "") continue;
    const label = d === "product" ? "产品" : d === "project" ? "项目" : "执行";
    const list = d === "product" ? products : d === "project" ? projects : executions;
    manualParts.push(`${label} ${scopeNameOf(list, v)}`);
  }
  const text = manualParts.length > 0
    ? manualParts.join(" · ")
    : effText !== "" ? `默认 · ${effText}` : "未选择范围";
  return createElement("div", { style: scopeSummaryStyle },
    createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: text },
      `范围：${text}`),
    meta?.errors !== undefined && createElement("span", { style: scopeErrorStyle, title: Object.values(meta.errors).join("；") }, "部分列表加载失败"),
    disabled
      ? null
      : createElement("button", { onClick: onOpen, style: scopeEditBtnStyle, "aria-label": "修改数据范围" }, "修改"),
  );
}

/** 范围修改弹窗：ScopeBar 移入居中卡片；外点/Esc 关闭；显式选择可一键清除回落文件绑定。 */
function ScopeModal({ tab, sel, onChange, meta, binding, effective, onClose }: {
  tab: TabKey;
  sel: ScopeSelection;
  onChange: (patch: Partial<ScopeSelection>) => void;
  meta: MetaScopesResponse | null;
  binding: WorkspaceBinding | undefined;
  effective: WorkspaceBinding | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    // globalThis 前缀取 DOM 类型——react 的 KeyboardEvent 导入遮蔽了全局名
    const onKey = (e: globalThis.KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const hasManual = sel.product !== "" || sel.project !== "" || sel.execution !== "";
  return createElement("div", { style: modalOverlayStyle, onClick: onClose, role: "presentation" },
    createElement("div", {
      style: modalCardStyle,
      onClick: (e: MouseEvent) => { e.stopPropagation(); },
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "选择数据范围",
    },
      createElement("div", { style: modalTitleStyle }, "选择数据范围"),
      meta === null && createElement("div", { style: hintStyle }, "范围列表加载中…"),
      createElement(ScopeBar, { tab, sel, onChange, meta, binding, effective, disabled: false }),
      createElement("div", { style: modalFooterStyle },
        hasManual && createElement("button", {
          onClick: () => { onChange({ product: "", project: "", execution: "" }); },
          style: reloginLinkStyle,
        }, "清除选择（用文件绑定默认）"),
        createElement("span", { style: { flex: 1 } }),
        createElement("button", { onClick: onClose, style: filterBtnStyle(true) }, "完成"),
      ),
    ),
  );
}

/** 过滤栏（状态/优先级/严重程度/关键词 + 全部 vs 指派给我）；加载中 counts 缺省时不显示数字。 */
function FilterBar({ tab, sel, onApply, onlyMine, setOnlyMine, counts, myRealname, disabled, canFilterMine = true }: {
  tab: TabKey;
  sel: TabFilterState;
  onApply: (tab: TabKey, patch: Partial<TabFilterState>) => void;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  counts: { all: number; mine: number } | undefined;
  myRealname: string;
  disabled?: boolean | undefined;
  /** 当前无登录身份时隐藏「仅指派给我」（避免按他人账号静默过滤）。 */
  canFilterMine?: boolean | undefined;
}) {
  return createElement("div", { style: filterBarStyle },
    createElement("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
      createElement("select", {
        value: sel.status,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => onApply(tab, { status: e.target.value }),
        style: filterSelectStyle,
        "aria-label": "状态筛选",
        disabled,
      }, ...FILTER_OPTIONS[tab].map((o) =>
        createElement("option", { key: o.key, value: o.key }, o.label))),
      createElement("select", {
        value: sel.pri,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => onApply(tab, { pri: e.target.value }),
        style: filterSelectStyle,
        "aria-label": "优先级筛选",
        disabled,
      }, ...PRI_OPTIONS.map((o) =>
        createElement("option", { key: o.key, value: o.key }, o.label))),
      tab === "bugs" && createElement("select", {
        value: sel.severity,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => onApply(tab, { severity: e.target.value }),
        style: filterSelectStyle,
        "aria-label": "严重程度筛选",
        disabled,
      }, ...SEVERITY_OPTIONS.map((o) =>
        createElement("option", { key: o.key, value: o.key }, o.label))),
      createElement("input", {
        defaultValue: sel.search,
        placeholder: "关键词，回车搜索",
        onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== "Enter") return;
          onApply(tab, { search: (e.target as HTMLInputElement).value });
        },
        style: filterSearchStyle,
        "aria-label": "关键词搜索",
        disabled,
      }),
      createElement("button", {
        onClick: () => { setOnlyMine(false); },
        style: filterBtnStyle(!onlyMine),
        disabled,
      }, counts !== undefined ? `全部 (${counts.all})` : "全部"),
      canFilterMine && createElement("button", {
        onClick: () => { setOnlyMine(true); },
        style: filterBtnStyle(onlyMine),
        disabled,
      }, counts !== undefined ? `仅指派给我 (${counts.mine})` : "仅指派给我"),
    ),
    myRealname !== "" ? createElement("span", { style: userTagStyle }, `账号: ${myRealname}`)
      : !canFilterMine && createElement("span", { style: userTagStyle }, "未识别登录身份，无法按指派过滤"),
  );
}

/** Tab 正文：按工作区绑定展示各视图（按视图懒加载：切 Tab 才拉对应数据）+ 状态筛选 + 详情查看 + 登录入口。 */
export function ZentaoPanelBody() {
  const workspace = useActiveWorkspace();
  const [showLogin, setShowLogin] = useState(false);
  const [tab, setTab] = useState<TabKey>("tasks");
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(1);
  // 筛选状态：每个视图独立记住（状态/优先级/严重程度/关键词）；改动即经查询串触发服务端重查
  const [filterSel, setFilterSel] = useState<Record<PanelTab, TabFilterState>>({
    tasks: defaultTabFilter("tasks"),
    bugs: defaultTabFilter("bugs"),
    stories: defaultTabFilter("stories"),
    testtasks: defaultTabFilter("testtasks"),
    testcases: defaultTabFilter("testcases"),
  });
  const filterQuery = buildOverviewQuery(tab, filterSel[tab]);
  // 范围选择（产品/项目/执行）：localStorage 按工作区记忆，显式选择优先级高于文件绑定；
  // 服务端按视图取相关维度（tasks→execution，bugs→三选一，其余→product）
  const [scopeSel, setScopeSel] = useState<ScopeSelection>(() => loadScopeSelection(workspace.path));
  useEffect(() => { setScopeSel(loadScopeSelection(workspace.path)); }, [workspace.path]);
  const meta = useMetaScopes();
  const scopeQuery = buildScopeQuery(tab, scopeSel);
  const { data, refresh, loading } = useOverview(workspace.path, tab, filterQuery, scopeQuery);
  // 范围修改弹窗开关（摘要行「修改」入口）
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  /** 重新登录：先经 CLI 清理当前登录凭证，再进登录视图并刷新——刷新返回 1006
   *  后登录门禁接管（无「收起」，必须重新登录）。登出请求失败也不阻塞进登录
   *  视图（凭证仍在，登录后覆盖；此时视图带「收起」可回列表）。 */
  const relogin = (): void => {
    fetch(LOGOUT_URL, { method: "POST" })
      .catch(() => { /* 端点失败（如旧版服务端未重启）：仍进登录视图，覆盖式登录 */ })
      .then(() => {
        setShowLogin(true);
        refresh();
      });
  };
  // 各视图行数（该视图加载后才知道；Tab 标签按需展示）
  const [counts, setCounts] = useState<Partial<Record<PanelTab, number>>>({});
  useEffect(() => {
    if (data !== null && data.view === tab && data.error === undefined && data.unconfigured !== true) {
      setCounts((c) => (c[tab] === data.rows.length ? c : { ...c, [tab]: data.rows.length }));
    }
  }, [data, tab]);
  // 筛选切换中的列表骨架态。防卡死关键：只在「请求键确实会变化」时置位——
  // 同值重提交（如搜索框原样回车）不会触发新请求，置位将永久无 loading 来清除
  const [switching, setSwitching] = useState(false);
  useEffect(() => { if (!loading) setSwitching(false); }, [loading]);
  const switchIfChanged = (nextKey: string): void => {
    const currentKey = `${tab}|${filterQuery}|${scopeQuery}`;
    if (nextKey !== currentKey) setSwitching(true);
  };
  const applyFilter = (tab: PanelTab, patch: Partial<TabFilterState>) => {
    const newSel = { ...filterSel[tab], ...patch };
    const newQuery = buildOverviewQuery(tab, newSel);
    switchIfChanged(`${tab}|${newQuery}|${scopeQuery}`);
    setFilterSel((s) => ({ ...s, [tab]: newSel }));
    setSelectedRow(null);
    setPage(1);
  };
  const changeTab = (next: TabKey): void => {
    if (next === tab) return;
    switchIfChanged(`${next}|${buildOverviewQuery(next, filterSel[next])}|${buildScopeQuery(next, scopeSel)}`);
    setTab(next);
    setSelectedRow(null);
    setPage(1);
  };
  /** 范围选择变更：持久化到 localStorage 并触发重查。项目变更时级联清空不属于该项目的执行选择。 */
  const changeScope = (patch: Partial<ScopeSelection>): void => {
    const next = { ...scopeSel, ...patch };
    if (patch.project !== undefined && next.execution !== "") {
      const exec = (meta?.executions ?? []).find((e) => String(e.id) === next.execution);
      if (patch.project === "" || (exec !== undefined && String(exec.project ?? "") !== patch.project)) {
        next.execution = "";
      }
    }
    saveScopeSelection(workspace.path, next);
    switchIfChanged(`${tab}|${filterQuery}|${buildScopeQuery(tab, next)}`);
    setScopeSel(next);
    setSelectedRow(null);
    setPage(1);
  };
  const tabs: { key: TabKey; label: string }[] = [
    { key: "tasks", label: `任务${counts.tasks !== undefined ? `（${counts.tasks}）` : ""}` },
    { key: "bugs", label: `Bug${counts.bugs !== undefined ? `（${counts.bugs}）` : ""}` },
    { key: "stories", label: `需求${counts.stories !== undefined ? `（${counts.stories}）` : ""}` },
    { key: "testtasks", label: `测试单${counts.testtasks !== undefined ? `（${counts.testtasks}）` : ""}` },
    { key: "testcases", label: `用例${counts.testcases !== undefined ? `（${counts.testcases}）` : ""}` },
  ];

  // 当前视图的数据（切 Tab 途中旧数据属于上一视图，视为加载中 → 骨架屏）
  const viewData = data !== null && data.view === tab ? data : null;

  if (workspace.path === "") {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, "未识别到当前工作区（打开一个工作区会话后再试）"),
      createElement("div", { style: { height: "10px" } }),
      createElement("button", { onClick: workspace.refresh, style: reloginLinkStyle }, "重试"));
  }
  // 切 Tab 加载中：Tab 栏与筛选栏保持可见（布局零跳动），仅列表区骨架
  if (viewData === null) {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: tabBarStyle, role: "tablist", "aria-label": "禅道概览分类" },
        ...tabs.map((t) =>
          createElement("button", {
            key: t.key,
            role: "tab",
            "aria-selected": tab === t.key,
            onClick: () => { changeTab(t.key); },
            style: tabStyle(tab === t.key),
          }, t.label))),
      createElement(ScopeSummary, { tab, sel: scopeSel, meta, binding: undefined, effective: undefined, disabled: true, onOpen: () => {} }),
      createElement(FilterBar, {
        tab, sel: filterSel[tab], onApply: applyFilter,
        onlyMine, setOnlyMine, counts: undefined, myRealname: "", disabled: true, canFilterMine: true,
      }),
      createElement(SkeletonRows, { rows: 5, tab, filterBar: false }),
    );
  }
  if (viewData.unconfigured === true) {
    return createElement(UnconfiguredGuide, {
      workspace,
      onRefresh: refresh,
      scopeProps: { tab, sel: scopeSel, onChange: changeScope, meta, binding: undefined, effective: undefined, disabled: false },
    });
  }
  // 登录态门禁：本地无凭证（响应无 currentUser）或查询报未登录（1006/令牌失效）时，
  // 不渲染列表/Tab/筛选——面板整体切换为登录视图（显式 showLogin 同样进入该视图）
  const loginGate = viewData.currentUser === undefined
    || (viewData.error !== undefined && /1006|未登录/.test(viewData.error));
  if (showLogin || loginGate) {
    return createElement("div", { style: paneWrapperStyle },
      loginGate && viewData.error !== undefined && createElement("div", { style: hintStyle }, `未登录或登录已过期：${viewData.error}`),
      createElement("div", { style: { height: "10px" } }),
      createElement(LoginForm, {
        onLoggedIn: () => { setShowLogin(false); refresh(); },
        onClose: loginGate ? undefined : () => { setShowLogin(false); },
      }),
    );
  }
  if (viewData.error !== undefined) {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, `禅道数据获取失败：${viewData.error}`),
      loading && createElement("div", { style: hintStyle }, "正在刷新数据（数据量较大时约需几秒）…"),
      createElement("div", { style: { height: "10px" } }),
      createElement("button", { onClick: refresh, style: reloginLinkStyle }, "重试刷新"),
      createElement("div", { style: { height: "10px" } }),
      createElement(LoginForm, { onLoggedIn: refresh }),
    );
  }

  const myAccount = viewData.currentUser?.account ?? "";
  const myRealname = viewData.currentUser?.realname ?? "";
  const canFilterMine = myAccount !== "" || myRealname !== "";
  const isMine = (r: Record<string, unknown>) =>
    (myAccount && (r.assignedTo === myAccount || r.openedBy === myAccount || r.owner === myAccount)) ||
    (myRealname && (r.assignedToRealName === myRealname || r.openedBy === myRealname));

  const rawList = viewData.rows;
  const mineCount = (rawList as Array<Record<string, unknown>>).filter(isMine).length;
  const displayRows = onlyMine
    ? (rawList as Array<Record<string, unknown>>).filter(isMine)
    : (rawList as Array<Record<string, unknown>>);

  return createElement("div", { style: paneWrapperStyle },
    viewData.note !== undefined && createElement("div", { style: hintStyle, key: "note" }, viewData.note),
    // 顶部分类切换（任务 / Bug）
    createElement("div", { style: tabBarStyle, role: "tablist", "aria-label": "禅道概览分类" },
      ...tabs.map((t) =>
        createElement("button", {
          key: t.key,
          role: "tab",
          "aria-selected": tab === t.key,
          onClick: () => { changeTab(t.key); },
          style: tabStyle(tab === t.key),
        }, t.label))),

    // 正文区：若选中了某条数据则渲染详情视图，否则渲染过滤栏与卡片列表
    selectedRow !== null
      ? createElement(DetailView, {
          row: selectedRow,
          type: tab,
          serverUrl: viewData.serverUrl,
          onBack: () => setSelectedRow(null),
        })
      : createElement("div", { role: "tabpanel", style: { minHeight: "120px" } },
          // 范围摘要行（紧凑单行；点「修改」弹窗编辑，避免三下拉常驻占空间）
          createElement(ScopeSummary, {
            tab, sel: scopeSel, meta,
            binding: viewData.config, effective: viewData.effective,
            onOpen: () => { setScopeModalOpen(true); },
          }),
          // 快捷过滤栏：状态/优先级（Bug 加严重程度）/关键词 + 全部 vs 指派给我
          createElement(FilterBar, {
            tab, sel: filterSel[tab], onApply: applyFilter,
            onlyMine, setOnlyMine: (v) => { setOnlyMine(v); setSelectedRow(null); setPage(1); },
            counts: { all: rawList.length, mine: mineCount }, myRealname, canFilterMine,
          }),
          // 筛选切换中：列表区换骨架行（新数据到达自动恢复）
          switching
            ? createElement(SkeletonRows, { rows: 5, tab, filterBar: false })
            : createElement(RowList, {
                rows: displayRows,
                nameKey: tab === "tasks" ? "name" : "title",
                type: tab,
                page,
                onPageChange: (newPage) => setPage(newPage),
                onSelect: (row) => setSelectedRow(row),
              }),
        ),

    createElement("div", { style: { height: "16px" } }),
    showLogin
      ? createElement(LoginForm, { onLoggedIn: refresh, onClose: () => setShowLogin(false) })
      : createElement("div", { style: { display: "flex", gap: "12px", alignItems: "center" } },
          createElement("button", { onClick: refresh, style: reloginLinkStyle }, "刷新数据"),
          loading && createElement("span", { style: hintStyle }, "刷新中…"),
          createElement("span", { style: { color: T.borderSubtle, fontSize: "12px" } }, "|"),
          createElement("button", { onClick: relogin, style: reloginLinkStyle }, "重新登录 / 切换账号")),
    scopeModalOpen && createElement(ScopeModal, {
      tab, sel: scopeSel, onChange: changeScope, meta,
      binding: viewData.config, effective: viewData.effective,
      onClose: () => { setScopeModalOpen(false); },
    }),
  );
}

/** Tab 正文容器：占满右侧栏面板高度，内部滚动。 */
const paneWrapperStyle: CSSProperties = {
  height: "100%", boxSizing: "border-box", overflowY: "auto", padding: "14px 16px",
};

const tabBarStyle: CSSProperties = {
  display: "flex", gap: "4px", marginBottom: "10px",
  borderBottom: `1px solid ${T.border}`,
};
const tabStyle = (active: boolean): CSSProperties => ({
  border: "none", background: "transparent", cursor: "pointer",
  padding: "6px 10px", fontSize: "13px",
  fontWeight: active ? "600" : "400",
  color: active ? T.accent : T.textSecondary,
  borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent",
  marginBottom: "-1px",
});

const reloginLinkStyle: CSSProperties = {
  border: "none", background: "transparent", cursor: "pointer", padding: "0",
  fontSize: "12px", color: T.textSecondary, textDecoration: "underline",
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "10px",
  paddingBottom: "2px",
};

/** 范围选择行：与过滤栏同节奏，三个下拉 + 生效范围回显。 */
const scopeBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "wrap",
  marginBottom: "8px",
};

/** 生效范围回显小字（ScopeBar 行内右侧）。 */
const scopeEffectiveStyle: CSSProperties = {
  fontSize: "11px",
  color: T.textSecondary,
  marginLeft: "auto",
  maxWidth: "45%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** 范围列表加载失败提示（降级：选择器可用但选项不全）。 */
const scopeErrorStyle: CSSProperties = {
  fontSize: "11px",
  color: T.accent,
};

/** 范围摘要行（紧凑单行，浅底色块）。 */
const scopeSummaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "8px",
  padding: "5px 8px",
  background: T.surfaceMuted,
  border: `1px solid ${T.borderSubtle}`,
  borderRadius: T.radiusSm,
  fontSize: "11px",
  color: T.textSecondary,
  minWidth: 0,
};

/** 摘要行「修改」按钮（链接态）。 */
const scopeEditBtnStyle: CSSProperties = {
  border: "none", background: "transparent", cursor: "pointer", padding: "0",
  fontSize: "11px", color: T.accent, textDecoration: "underline",
  flexShrink: 0,
};

/** 范围修改弹窗：全屏遮罩 + 居中卡片。 */
const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 18, 25, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalCardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radiusMd,
  padding: "16px",
  minWidth: "360px",
  maxWidth: "92%",
  boxShadow: "0 8px 24px rgba(17, 24, 39, 0.25)",
};

const modalTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  color: T.text,
  marginBottom: "10px",
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: "12px",
};

const filterBtnStyle = (active: boolean): CSSProperties => ({
  border: active ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
  background: active ? T.accent : T.surface,
  color: active ? "#fff" : T.textSecondary,
  cursor: "pointer",
  padding: "0 10px",
  height: "26px",
  fontSize: "11px",
  fontWeight: active ? "600" : "400",
  borderRadius: T.radiusSm,
  transition: `all ${T.durationFast} ${T.easeInOut}`,
});

/** 下拉箭头（自绘 SVG，替代原生箭头——原生箭头贴右边框太丑）。 */
const CHEVRON_BG = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='9' height='6' viewBox='0 0 9 6'><path d='M1 1.2l3.5 3.6L8 1.2' fill='none' stroke='%238890a3' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>")`;

/** 筛选下拉：26px 高、11px 字号；隐藏原生箭头，右侧 22px 放自绘箭头。 */
const filterSelectStyle: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  border: `1px solid ${T.border}`,
  background: T.surface,
  backgroundImage: CHEVRON_BG,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  color: T.text,
  cursor: "pointer",
  padding: "0 22px 0 8px",
  height: "26px",
  fontSize: "11px",
  borderRadius: T.radiusSm,
  outline: "none",
};

/** 关键词搜索输入：与筛选下拉同高同字号。 */
const filterSearchStyle: CSSProperties = {
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.text,
  padding: "0 10px",
  height: "26px",
  fontSize: "11px",
  borderRadius: T.radiusSm,
  outline: "none",
  width: "120px",
};

const userTagStyle: CSSProperties = {
  fontSize: "11px",
  color: T.textSecondary,
};

const rowCardStyle: CSSProperties = {
  padding: "8px 10px",
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: "6px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  boxSizing: "border-box",
};

const rowTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};

const rowMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "11px",
  color: T.textSecondary,
};

const idTagStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  color: T.textSecondary,
  background: T.surfaceMuted,
  padding: "1px 4px",
  borderRadius: "3px",
  flexShrink: 0,
};

const paginationBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: "10px",
  paddingTop: "8px",
  borderTop: `1px solid ${T.border}`,
};

const pageBtnStyle = (disabled: boolean): CSSProperties => ({
  border: `1px solid ${T.border}`,
  background: disabled ? T.surfaceMuted : T.surface,
  color: disabled ? T.textCaption : T.text,
  cursor: disabled ? "not-allowed" : "pointer",
  padding: "3px 10px",
  fontSize: "12px",
  borderRadius: T.radiusXs,
  opacity: disabled ? 0.6 : 1,
});

const pageInfoStyle: CSSProperties = {
  fontSize: "11px",
  color: T.textSecondary,
};
