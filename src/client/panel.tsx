/**
 * 右侧侧边栏"禅道概览"Tab 面板（sidebar.right.pane.tab / .title 插槽，
 * 入口注册见 index.ts）。按当前工作区的 .dsh-zentao.json 绑定配置展示
 * 该执行下的任务与该范围内的 Bug，数据来自同源
 * /__dsh-zentao__/overview?workspace=<工作区路径>。纯函数/类型见
 * overview.ts 与 workspace.ts。
 */
import { createElement, useEffect, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import type { OverviewResponse } from "./overview.ts";
import { overviewSummary } from "./overview.ts";
import { useActiveWorkspace } from "./workspace.ts";
import { ZentaoTabIcon } from "./icons.tsx";

const OVERVIEW_URL = "/__dsh-zentao__/overview";
const LOGIN_URL = "/__dsh-zentao__/login";
const CONFIG_FILENAME = ".dsh-zentao.json";
const CONFIG_SAMPLE = '{ "product": 2, "execution": 168 }';

function useOverview(workspacePath: string): { data: OverviewResponse | null; refresh: () => void } {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (workspacePath === "") return;
    let alive = true;
    // 首次挂载走服务端 60s 缓存（秒开）；显式 refresh（登录后）强制刷新。
    const url = tick === 0
      ? `${OVERVIEW_URL}?workspace=${encodeURIComponent(workspacePath)}`
      : `${OVERVIEW_URL}?workspace=${encodeURIComponent(workspacePath)}&fresh=1`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<OverviewResponse> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setData(d); })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error && /^HTTP /.test(err.message) ? err.message : "网络错误";
        setData({ tasks: [], bugs: [], error: message });
      });
    return () => { alive = false; };
  }, [tick, workspacePath]);
  return { data, refresh: () => setTick((t) => t + 1) };
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "doing" || status === "active"
    ? "var(--dsh-accent, #2f6fed)"
    : status === "closed" || status === "done"
      ? "var(--dsh-text-secondary, #6b7280)"
      : "var(--dsh-warning, #b45309)";
  return createElement("span", { style: { color, fontWeight: "600" } }, status);
}

/** 视图内容：空态或行表格（最多 30 行）。 */
function RowList({ rows, nameKey }: {
  rows: { id: string | number; status: string; [k: string]: unknown }[]; nameKey: "name" | "title";
}) {
  return rows.length === 0
    ? createElement("div", { style: emptyStyle }, "暂无数据")
    : createElement("table", { style: tableStyle },
        createElement("tbody", null,
          ...rows.slice(0, 30).map((row, i) =>
            createElement("tr", { key: i }, ...[
              createElement("td", { key: "n", style: tdStyle }, String(row[nameKey] ?? row.id)),
              createElement("td", { key: "s", style: tdStyle }, createElement(StatusBadge, { status: row.status })),
            ]))));
}

const sectionTitleStyle: CSSProperties = {
  fontSize: "12px", fontWeight: "600", color: "var(--dsh-text-secondary, #6b7280)",
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
};
const tableStyle: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: "13px",
};
const tdStyle: CSSProperties = {
  padding: "4px 8px 4px 0", borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
  maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const emptyStyle: CSSProperties = {
  padding: "10px", color: "var(--dsh-text-secondary, #6b7280)", fontSize: "13px",
  border: "1px dashed var(--dsh-border, #e3e6ea)", borderRadius: "6px", textAlign: "center",
};
const hintStyle: CSSProperties = {
  fontSize: "12px", color: "var(--dsh-text-secondary, #6b7280)",
  whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6,
};
const codeStyle: CSSProperties = {
  display: "block", margin: "6px 0", padding: "8px 10px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px",
  background: "var(--dsh-surface-muted, #f5f6f8)", border: "1px solid var(--dsh-border, #e3e6ea)",
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

/** 面板内登录表单：提交到同源 /__dsh-zentao__/login，成功后回调刷新数据。 */
function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [server, setServer] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        if (d.ok === true) onLoggedIn();
        else setError(d.error ?? "登录失败");
      })
      .catch(() => setError("网络错误"))
      .finally(() => setPending(false));
  };
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
  display: "block", fontSize: "12px", color: "var(--dsh-text-secondary, #6b7280)", marginBottom: "3px",
};
const loginInputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: "13px",
  border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "6px",
  background: "var(--dsh-surface, #fff)", color: "inherit",
};
const loginErrorStyle: CSSProperties = {
  fontSize: "12px", color: "var(--dsh-danger, #dc2626)", margin: "4px 0 8px",
  whiteSpace: "pre-wrap", wordBreak: "break-all",
};
const loginSubmitStyle = (pending: boolean): CSSProperties => ({
  width: "100%", padding: "7px 0", fontSize: "13px", fontWeight: "600",
  border: "none", borderRadius: "6px", cursor: pending ? "default" : "pointer",
  background: "var(--dsh-accent, #2f6fed)", color: "#fff", opacity: pending ? 0.7 : 1,
});

type TabKey = "tasks" | "bugs";

/** Tab 标题栏：图标 + 标题 + 未关闭 Bug 计数徽标（数据走服务端 60s 缓存）。 */
export function ZentaoPanelTitle() {
  const workspace = useActiveWorkspace();
  const { data } = useOverview(workspace.path);
  const summary = data === null ? null : overviewSummary(data);
  return createElement("span", { style: titleWrapperStyle },
    createElement(ZentaoTabIcon, { style: { marginRight: 6 } }),
    createElement("span", null, "禅道概览"),
    summary !== null && summary.openBugs > 0 &&
      createElement("span", { style: countBadgeStyle, title: "未关闭 Bug" }, String(summary.openBugs)),
  );
}

const titleWrapperStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 0,
};
const countBadgeStyle: CSSProperties = {
  marginLeft: 6, padding: "0 6px", borderRadius: 999,
  fontSize: 11, fontWeight: 600, lineHeight: "16px",
  background: "var(--dsh-accent, #2f6fed)", color: "#fff",
};

/** 未配置工作区绑定的引导态：文件路径 + 格式示例。 */
function UnconfiguredGuide({ workspace }: { workspace: { path: string; title: string } }) {
  return createElement("div", { style: paneWrapperStyle },
    createElement("div", { style: sectionTitleStyle }, `工作区 ${workspace.title}`),
    createElement("div", { style: hintStyle },
      "当前工作区尚未绑定禅道对象。在工作区根目录创建 ",
      createElement("code", null, CONFIG_FILENAME),
      `，声明所属的禅道产品 / 执行 / 项目（execution 供任务视图，product（或 project / execution）供 Bug 视图）：`),
    createElement("code", { style: codeStyle }, `${workspace.path}/${CONFIG_FILENAME}\n${CONFIG_SAMPLE}`),
    createElement("div", { style: hintStyle },
      "创建后点击下方刷新即可按该范围展示任务与 Bug。产品 / 执行的 ID 可在对话中用 zentao 工具查询（如 zentao 模块=product 动作=list）。"),
    createElement("button", { style: reloginLinkStyle }, "刷新"),
  );
}

/** Tab 正文：按工作区绑定展示 任务 / Bug 两视图 + 登录入口。 */
export function ZentaoPanelBody() {
  const workspace = useActiveWorkspace();
  const { data, refresh } = useOverview(workspace.path);
  const [showLogin, setShowLogin] = useState(false);
  const [tab, setTab] = useState<TabKey>("tasks");
  if (workspace.path === "") {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, "未识别到当前工作区（打开一个工作区会话后再试）"),
      createElement("div", { style: { height: "10px" } }),
      createElement("button", { onClick: workspace.refresh, style: reloginLinkStyle }, "重试"));
  }
  if (data === null) return createElement("div", { style: paneWrapperStyle },
    createElement("div", { style: emptyStyle }, "加载中…"));
  if (data.unconfigured === true) return createElement(UnconfiguredGuide, { workspace });
  if (data.error !== undefined) {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, `禅道数据获取失败：${data.error}`),
      createElement("div", { style: { height: "10px" } }),
      createElement(LoginForm, { onLoggedIn: refresh }),
    );
  }
  const tabs: { key: TabKey; label: string }[] = [
    { key: "tasks", label: `任务（${data.tasks.length}）` },
    { key: "bugs", label: `Bug（${data.bugs.length}）` },
  ];
  return createElement("div", { style: paneWrapperStyle },
    data.note !== undefined && createElement("div", { style: hintStyle, key: "note" }, data.note),
    createElement("div", { style: tabBarStyle, role: "tablist", "aria-label": "禅道概览分类" },
      ...tabs.map((t) =>
        createElement("button", {
          key: t.key,
          role: "tab",
          "aria-selected": tab === t.key,
          onClick: () => setTab(t.key),
          style: tabStyle(tab === t.key),
        }, t.label))),
    createElement("div", { role: "tabpanel", style: { minHeight: "120px" } },
      tab === "tasks" && createElement(RowList, { rows: data.tasks, nameKey: "name" }),
      tab === "bugs" && createElement(RowList, { rows: data.bugs, nameKey: "title" })),
    createElement("div", { style: { height: "10px" } }),
    showLogin
      ? createElement(LoginForm, { onLoggedIn: () => { setShowLogin(false); refresh(); } })
      : createElement("button", { onClick: () => setShowLogin(true), style: reloginLinkStyle }, "重新登录 / 切换账号"),
  );
}

/** Tab 正文容器：占满右侧栏面板高度，内部滚动。 */
const paneWrapperStyle: CSSProperties = {
  height: "100%", boxSizing: "border-box", overflowY: "auto", padding: "14px 16px",
};

const tabBarStyle: CSSProperties = {
  display: "flex", gap: "4px", marginBottom: "12px",
  borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
};
const tabStyle = (active: boolean): CSSProperties => ({
  border: "none", background: "transparent", cursor: "pointer",
  padding: "6px 10px", fontSize: "13px",
  fontWeight: active ? "600" : "400",
  color: active ? "var(--dsh-accent, #2f6fed)" : "var(--dsh-text-secondary, #6b7280)",
  borderBottom: active ? "2px solid var(--dsh-accent, #2f6fed)" : "2px solid transparent",
  marginBottom: "-1px",
});

const reloginLinkStyle: CSSProperties = {
  border: "none", background: "transparent", cursor: "pointer", padding: "0",
  fontSize: "12px", color: "var(--dsh-text-secondary, #6b7280)", textDecoration: "underline",
};
