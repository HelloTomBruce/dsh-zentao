/**
 * 右侧侧边栏"禅道概览"Tab 面板（sidebar.right.pane.tab / .title 插槽，
 * 入口注册见 index.ts）。按当前工作区的 .dsh-zentao.json 绑定配置展示
 * 该执行下的任务与该范围内的 Bug，数据来自同源
 * /__dsh-zentao__/overview?workspace=<工作区路径>。纯函数/类型见
 * overview.ts 与 workspace.ts。
 */
import { createElement, useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";
import type { OverviewResponse, PanelTab, TabFilterState } from "./overview.ts";
import { buildOverviewQuery, CASE_TYPE_MAP, defaultTabFilter, FILTER_OPTIONS, normalizeOverview, openRowCount, PRI_OPTIONS, SEVERITY_OPTIONS, STORY_STAGE_MAP } from "./overview.ts";
import { useActiveWorkspace } from "./workspace.ts";
import { ZentaoTabIcon } from "./icons.tsx";
import { T } from "./theme.ts";
import { PriBadge, StatusBadge } from "./badges.tsx";
import { DetailView } from "./detail-view.tsx";
export { sanitizeAndFormatHtml } from "./sanitize.ts";

const OVERVIEW_URL = "/__dsh-zentao__/overview";
const LOGIN_URL = "/__dsh-zentao__/login";
const CONFIG_FILENAME = ".dsh-zentao.json";
const CONFIG_SAMPLE = '{ "product": 2, "execution": 168 }';

function useOverview(workspacePath: string, view: PanelTab, filterQuery: string, executionParam: string): { data: OverviewResponse | null; refresh: () => void; loading: boolean } {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  // fresh=1 仅对「显式 refresh 后的下一次请求」生效——登录/刷新后的常规切 Tab/改筛选仍走服务端缓存
  const bypassOnceRef = useRef(false);
  useEffect(() => {
    if (workspacePath === "") return;
    let alive = true;
    setLoading(true);
    // 按视图懒加载：切 Tab 换 view 即拉对应视图（服务端按 工作区+视图+执行+筛选 缓存）。
    const exec = view === "tasks" && executionParam !== "" ? `&execution=${executionParam}` : "";
    const fresh = bypassOnceRef.current ? "&fresh=1" : "";
    bypassOnceRef.current = false;
    const url = `${OVERVIEW_URL}?workspace=${encodeURIComponent(workspacePath)}&view=${view}${exec}&${filterQuery}${fresh}`;
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
  }, [nonce, workspacePath, view, filterQuery, executionParam]);
  return { data, refresh: () => { bypassOnceRef.current = true; setNonce((n) => n + 1); }, loading };
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

/** 未配置工作区绑定的引导态：文件路径 + 格式示例。 */
function UnconfiguredGuide({ workspace, onRefresh }: {
  workspace: { path: string; title: string };
  onRefresh: () => void;
}) {
  return createElement("div", { style: paneWrapperStyle },
    createElement("div", { style: sectionTitleStyle }, `工作区 ${workspace.title}`),
    createElement("div", { style: hintStyle },
      "当前工作区尚未绑定禅道对象。在工作区根目录创建 ",
      createElement("code", null, CONFIG_FILENAME),
      `，声明所属的禅道产品 / 执行 / 项目（execution 供任务视图，product（或 project / execution）供 Bug 视图）：`),
    createElement("code", { style: codeStyle }, `${workspace.path}/${CONFIG_FILENAME}\n${CONFIG_SAMPLE}`),
    createElement("div", { style: hintStyle },
      "创建后点击下方刷新即可按该范围展示任务与 Bug。产品 / 执行的 ID 可在对话中用 zentao 工具查询（如 zentao 模块=product 动作=list）。"),
    createElement("button", { onClick: onRefresh, style: reloginLinkStyle }, "刷新"),
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
  // 任务视图的执行切换选择（"" = 用绑定默认；独立于筛选缓存键体系，服务端按 execution 分键）
  const [selectedExecution, setSelectedExecution] = useState("");
  const { data, refresh, loading } = useOverview(workspace.path, tab, filterQuery, selectedExecution);
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
    const currentKey = `${tab}|${filterQuery}|${selectedExecution}`;
    if (nextKey !== currentKey) setSwitching(true);
  };
  const applyFilter = (tab: PanelTab, patch: Partial<TabFilterState>) => {
    const newSel = { ...filterSel[tab], ...patch };
    const newQuery = buildOverviewQuery(tab, newSel);
    switchIfChanged(`${tab}|${tab === tab ? newQuery : filterQuery}|${selectedExecution}`);
    setFilterSel((s) => ({ ...s, [tab]: newSel }));
    setSelectedRow(null);
    setPage(1);
  };
  const changeTab = (next: TabKey): void => {
    if (next === tab) return;
    switchIfChanged(`${next}|${buildOverviewQuery(next, filterSel[next])}|${selectedExecution}`);
    setTab(next);
    setSelectedRow(null);
    setPage(1);
  };
  const changeExecution = (next: string): void => {
    if (next === selectedExecution) return;
    switchIfChanged(`${tab}|${filterQuery}|${next}`);
    setSelectedExecution(next);
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
      createElement(FilterBar, {
        tab, sel: filterSel[tab], onApply: applyFilter,
        onlyMine, setOnlyMine, counts: undefined, myRealname: "", disabled: true, canFilterMine: true,
      }),
      createElement(SkeletonRows, { rows: 5, tab, filterBar: false }),
    );
  }
  if (viewData.unconfigured === true) return createElement(UnconfiguredGuide, { workspace, onRefresh: refresh });
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
          // 执行切换（多执行绑定时显示；切换即按该执行重新拉取任务）
          tab === "tasks" && (viewData.config?.executions?.length ?? 0) > 1 && createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" } },
            createElement("span", { style: { fontSize: "11px", color: T.textSecondary } }, "执行"),
            createElement("select", {
              value: selectedExecution !== "" ? selectedExecution : String(viewData.config?.execution ?? ""),
              onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                changeExecution(e.target.value);
              },
              style: filterSelectStyle,
              "aria-label": "执行切换",
            }, ...(viewData.config?.executions ?? []).map((id) =>
              createElement("option", { key: id, value: String(id) }, `#${id}`)))),
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
          createElement("button", { onClick: () => setShowLogin(true), style: reloginLinkStyle }, "重新登录 / 切换账号")),
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
