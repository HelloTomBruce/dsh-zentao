/**
 * 右侧侧边栏"禅道概览"Tab 面板（sidebar.right.pane.tab / .title 插槽，
 * 入口注册见 index.ts）。按当前工作区的 .dsh-zentao.json 绑定配置展示
 * 该执行下的任务与该范围内的 Bug，数据来自同源
 * /__dsh-zentao__/overview?workspace=<工作区路径>。纯函数/类型见
 * overview.ts 与 workspace.ts。
 */
import { createElement, useEffect, useState } from "react";
import type { ChangeEvent, CSSProperties, MouseEvent } from "react";
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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  wait: { label: "未开始", color: "#b45309", bg: "#fef3c7" },
  doing: { label: "进行中", color: "#2563eb", bg: "#dbeafe" },
  done: { label: "已完成", color: "#16a34a", bg: "#dcfce7" },
  pause: { label: "已暂停", color: "#6b7280", bg: "#f3f4f6" },
  cancel: { label: "已取消", color: "#6b7280", bg: "#f3f4f6" },
  closed: { label: "已关闭", color: "#6b7280", bg: "#f3f4f6" },
  active: { label: "激活", color: "#dc2626", bg: "#fee2e2" },
  resolved: { label: "已解决", color: "#059669", bg: "#d1fae5" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? {
    label: status,
    color: "var(--dsh-text-secondary, #6b7280)",
    bg: "var(--dsh-surface-muted, #f3f4f6)",
  };
  return createElement("span", {
    style: {
      fontSize: "11px",
      fontWeight: "600",
      padding: "2px 6px",
      borderRadius: "4px",
      background: meta.bg,
      color: meta.color,
      whiteSpace: "nowrap",
      flexShrink: 0,
      display: "inline-block",
    },
  }, meta.label);
}

function PriBadge({ pri }: { pri: unknown }) {
  if (pri === undefined || pri === null || pri === "" || pri === "0" || pri === 0) return null;
  const p = String(pri);
  const bg = p === "1" ? "#fee2e2" : p === "2" ? "#ffedd5" : p === "3" ? "#eff6ff" : "#f3f4f6";
  const color = p === "1" ? "#b91c1c" : p === "2" ? "#c2410c" : p === "3" ? "#1d4ed8" : "#4b5563";
  return createElement("span", {
    style: {
      fontSize: "10px",
      fontWeight: "700",
      padding: "1px 5px",
      borderRadius: "4px",
      background: bg,
      color,
      marginRight: "5px",
      lineHeight: "14px",
      display: "inline-block",
      flexShrink: 0,
    },
  }, `P${p}`);
}

export function sanitizeAndFormatHtml(text: string): string {
  if (!text) return "";
  let s = text;

  // 1. 过滤高危标签
  s = s
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // 2. 解除 markdown 转义的方括号（zentao CLI 的 turndown 转换会输出 \\[步骤\\]）
  s = s.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

  // 3. 将 Markdown 格式的图片：![alt]({11561.png})、![alt](file-read-11561.png) 转为 <img>
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const idMatch = url.match(/(?:\{|file-(?:read|download)-)?(\d+)(?:\.[a-zA-Z0-9]+)?\}?/);
    if (idMatch) {
      return `<img src="/__dsh-zentao__/file?id=${idMatch[1]}" alt="${alt || "图片"}" />`;
    }
    return `<img src="${url}" alt="${alt || "图片"}" />`;
  });

  // 4. 将 HTML img 标签中的 {11587.png} 或 file-read-11587 替换为插件的同源流代理地址
  s = s
    .replace(/src=["']\{(\d+)(?:\.[a-zA-Z0-9]+)?\}["']/gi, (_m, id) => `src="/__dsh-zentao__/file?id=${id}"`)
    .replace(/src=["'][^"']*file-(?:read|download)-(\d+)[^"']*["']/gi, (_m, id) => `src="/__dsh-zentao__/file?id=${id}"`);

  // 5. 独立出现的 {11561.png} 或 {11561} 占位符（非 markdown、非 img 属性）
  s = s.replace(/(?:^|[^\w"'/])\{(\d+)(?:\.[a-zA-Z0-9]+)?\}(?:[^\w"'/]|$)/g, (_m, id) => {
    return `<img src="/__dsh-zentao__/file?id=${id}" alt="image-${id}" />`;
  });

  // 6. 段落排版与步骤高亮：
  // 若不含常见 HTML 块级标签，说明是 Markdown 或纯文本，将换行拆分为段落
  const hasHtmlBlocks = /<(?:p|div|br|ul|ol|li|table|tr|td|h[1-6])\b/i.test(s);
  if (!hasHtmlBlocks) {
    const paragraphs = s.split(/\r?\n\r?\n+/);
    s = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        const formatted = trimmed
          .replace(/\[(步骤|结果|期望|其它|其他)\]/g, `<strong style="color: var(--dsh-accent, #2563eb); display: block; margin: 6px 0 2px 0;">[$1]</strong>`)
          .replace(/\r?\n/g, "<br />");
        return `<p style="margin: 4px 0;">${formatted}</p>`;
      })
      .filter(Boolean)
      .join("");
  } else {
    s = s.replace(/\[(步骤|结果|期望|其它|其他)\]/g, `<strong style="color: var(--dsh-accent, #2563eb); display: block; margin: 6px 0 2px 0;">[$1]</strong>`);
  }

  return s;
}

function FieldItem({ label, value }: { label: string; value: string }) {
  return createElement("div", { style: fieldItemStyle },
    createElement("span", { style: fieldLabelStyle }, label),
    createElement("span", { style: fieldValueStyle }, value),
  );
}

/** 单条任务 / Bug 详情查看视图。 */
function DetailView({
  row,
  type,
  serverUrl,
  onBack,
}: {
  row: Record<string, unknown>;
  type: "tasks" | "bugs";
  serverUrl?: string | undefined;
  onBack: () => void;
}) {
  const isTask = type === "tasks";
  const title = String(isTask ? row.name ?? row.id : row.title ?? row.id);
  const assigned = String(row.assignedToRealName ?? row.assignedTo ?? "未指派");
  const openedBy = String(row.openedBy ?? "-");
  const openedDate = String(row.openedDate ?? "-");
  const deadline = String(row.deadline ?? "未设置");
  const status = String(row.status ?? "");
  const pri = row.pri;
  const desc = String(isTask ? row.desc ?? "" : row.steps ?? "");

  const webUrl = serverUrl
    ? `${serverUrl.replace(/\/+$/, "")}/${isTask ? "task" : "bug"}-view-${row.id}.html`
    : undefined;

  return createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      createElement("button", { onClick: onBack, style: backBtnStyle }, "← 返回列表"),
      webUrl && createElement("a", {
        href: webUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        style: openLinkStyle,
      }, "在禅道中查看 ↗"),
    ),
    createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
      createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
        createElement("span", { style: idTagStyle }, `#${row.id}`),
        createElement(PriBadge, { pri }),
        createElement(StatusBadge, { status }),
      ),
      createElement("div", { style: detailTitleStyle }, title),
    ),
    createElement("div", { style: gridStyle },
      createElement(FieldItem, { label: "指派给", value: assigned }),
      createElement(FieldItem, { label: "截止日期", value: deadline }),
      createElement(FieldItem, { label: "创建人", value: openedBy }),
      createElement(FieldItem, { label: "创建时间", value: openedDate.slice(0, 10) }),
      isTask && createElement(FieldItem, {
        label: "工时 (预计/消耗/剩余)",
        value: `${row.estimate ?? 0}h / ${row.consumed ?? 0}h / ${row.left ?? 0}h`,
      }),
      !isTask && row.severity !== undefined && createElement(FieldItem, {
        label: "严重程度",
        value: `级别 ${row.severity}`,
      }),
    ),
    createElement("div", { style: { marginTop: "4px" } },
      createElement("div", { style: sectionTitleStyle }, isTask ? "任务描述" : "重现步骤"),
      createElement("style", null, `
        .dsh-zentao-desc img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 6px 0;
          cursor: zoom-in;
          display: block;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid var(--dsh-border, #e3e6ea);
        }
        .dsh-zentao-desc p { margin: 4px 0; }
      `),
      desc.trim() !== ""
        ? createElement("div", {
            className: "dsh-zentao-desc",
            style: descBoxStyle,
            onClick: (e: MouseEvent<HTMLDivElement>) => {
              const target = e.target as HTMLElement;
              if (target.tagName === "IMG") {
                const src = (target as HTMLImageElement).src;
                if (src) window.open(src, "_blank");
              }
            },
            dangerouslySetInnerHTML: { __html: sanitizeAndFormatHtml(desc) },
          })
        : createElement("div", { style: emptyDescStyle }, "暂无详细描述"),
    ),
  );
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
  type: "tasks" | "bugs";
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
      const assigned = String(row.assignedToRealName ?? row.assignedTo ?? "未指派");
      const status = String(row.status ?? "");
      const deadline = row.deadline ? String(row.deadline) : undefined;
      const metaExtra = isTask
        ? (row.estimate !== undefined && row.estimate !== null && row.estimate !== "" ? `${row.estimate}h` : undefined)
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
          metaExtra && createElement("span", null, isTask ? `⏱️ ${metaExtra}` : `🔥 ${metaExtra}`),
          createElement("span", { style: { marginLeft: "auto", color: "var(--dsh-accent, #2f6fed)", fontSize: "11px" } }, "详情 →"),
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
  fontSize: "12px", fontWeight: "600", color: "var(--dsh-text-secondary, #6b7280)",
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
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

/** Tab 正文：按工作区绑定展示 任务 / Bug 两视图 + 详情查看 + 登录入口。 */
export function ZentaoPanelBody() {
  const workspace = useActiveWorkspace();
  const { data, refresh } = useOverview(workspace.path);
  const [showLogin, setShowLogin] = useState(false);
  const [tab, setTab] = useState<TabKey>("tasks");
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(1);

  if (workspace.path === "") {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, "未识别到当前工作区（打开一个工作区会话后再试）"),
      createElement("div", { style: { height: "10px" } }),
      createElement("button", { onClick: workspace.refresh, style: reloginLinkStyle }, "重试"));
  }
  if (data === null) return createElement("div", { style: paneWrapperStyle },
    createElement("div", { style: emptyStyle }, "加载中…"));
  if (data.unconfigured === true) return createElement(UnconfiguredGuide, { workspace, onRefresh: refresh });
  if (data.error !== undefined) {
    return createElement("div", { style: paneWrapperStyle },
      createElement("div", { style: emptyStyle }, `禅道数据获取失败：${data.error}`),
      createElement("div", { style: { height: "10px" } }),
      createElement("button", { onClick: refresh, style: reloginLinkStyle }, "重试刷新"),
      createElement("div", { style: { height: "10px" } }),
      createElement(LoginForm, { onLoggedIn: refresh }),
    );
  }

  const myAccount = data.currentUser?.account ?? "zhangyingwu";
  const myRealname = data.currentUser?.realname ?? "张盈武";
  const isMine = (r: Record<string, unknown>) =>
    (myAccount && (r.assignedTo === myAccount || r.openedBy === myAccount)) ||
    (myRealname && (r.assignedToRealName === myRealname || r.openedBy === myRealname));

  const rawList = tab === "tasks" ? data.tasks : data.bugs;
  const mineCount = (rawList as Array<Record<string, unknown>>).filter(isMine).length;
  const displayRows = onlyMine
    ? (rawList as Array<Record<string, unknown>>).filter(isMine)
    : (rawList as Array<Record<string, unknown>>);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "tasks", label: `任务（${data.tasks.length}）` },
    { key: "bugs", label: `Bug（${data.bugs.length}）` },
  ];

  return createElement("div", { style: paneWrapperStyle },
    data.note !== undefined && createElement("div", { style: hintStyle, key: "note" }, data.note),
    // 顶部分类切换（任务 / Bug）
    createElement("div", { style: tabBarStyle, role: "tablist", "aria-label": "禅道概览分类" },
      ...tabs.map((t) =>
        createElement("button", {
          key: t.key,
          role: "tab",
          "aria-selected": tab === t.key,
          onClick: () => { setTab(t.key); setSelectedRow(null); setPage(1); },
          style: tabStyle(tab === t.key),
        }, t.label))),

    // 正文区：若选中了某条数据则渲染详情视图，否则渲染过滤栏与卡片列表
    selectedRow !== null
      ? createElement(DetailView, {
          row: selectedRow,
          type: tab,
          serverUrl: data.serverUrl,
          onBack: () => setSelectedRow(null),
        })
      : createElement("div", { role: "tabpanel", style: { minHeight: "120px" } },
          // 快捷过滤栏：全部 vs 指派给我
          createElement("div", { style: filterBarStyle },
            createElement("div", { style: { display: "flex", gap: "6px" } },
              createElement("button", {
                onClick: () => { setOnlyMine(false); setSelectedRow(null); setPage(1); },
                style: filterBtnStyle(!onlyMine),
              }, `全部 (${rawList.length})`),
              createElement("button", {
                onClick: () => { setOnlyMine(true); setSelectedRow(null); setPage(1); },
                style: filterBtnStyle(onlyMine),
              }, `仅指派给我 (${mineCount})`),
            ),
            myRealname && createElement("span", { style: userTagStyle }, `账号: ${myRealname}`),
          ),
          createElement(RowList, {
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
      ? createElement(LoginForm, { onLoggedIn: () => { setShowLogin(false); refresh(); } })
      : createElement("div", { style: { display: "flex", gap: "12px", alignItems: "center" } },
          createElement("button", { onClick: refresh, style: reloginLinkStyle }, "刷新数据"),
          createElement("span", { style: { color: "var(--dsh-border, #e3e6ea)", fontSize: "12px" } }, "|"),
          createElement("button", { onClick: () => setShowLogin(true), style: reloginLinkStyle }, "重新登录 / 切换账号")),
  );
}

/** Tab 正文容器：占满右侧栏面板高度，内部滚动。 */
const paneWrapperStyle: CSSProperties = {
  height: "100%", boxSizing: "border-box", overflowY: "auto", padding: "14px 16px",
};

const tabBarStyle: CSSProperties = {
  display: "flex", gap: "4px", marginBottom: "10px",
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

const filterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "10px",
  paddingBottom: "2px",
};

const filterBtnStyle = (active: boolean): CSSProperties => ({
  border: active ? "1px solid var(--dsh-accent, #2f6fed)" : "1px solid var(--dsh-border, #e3e6ea)",
  background: active ? "var(--dsh-accent, #2f6fed)" : "var(--dsh-surface, #fff)",
  color: active ? "#fff" : "var(--dsh-text-secondary, #6b7280)",
  cursor: "pointer",
  padding: "3px 9px",
  fontSize: "11px",
  fontWeight: active ? "600" : "400",
  borderRadius: "12px",
  transition: "all 0.15s ease",
});

const userTagStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsh-text-secondary, #6b7280)",
};

const rowCardStyle: CSSProperties = {
  padding: "8px 10px",
  background: "var(--dsh-surface, #fff)",
  border: "1px solid var(--dsh-border, #e3e6ea)",
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
  color: "var(--dsh-text, #1f2937)",
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
  color: "var(--dsh-text-secondary, #6b7280)",
};

const idTagStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  color: "var(--dsh-text-secondary, #6b7280)",
  background: "var(--dsh-surface-muted, #f3f4f6)",
  padding: "1px 4px",
  borderRadius: "3px",
  flexShrink: 0,
};

const backBtnStyle: CSSProperties = {
  border: "1px solid var(--dsh-border, #e3e6ea)",
  background: "var(--dsh-surface, #fff)",
  color: "var(--dsh-text, #1f2937)",
  cursor: "pointer",
  padding: "4px 8px",
  fontSize: "12px",
  borderRadius: "4px",
};

const openLinkStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--dsh-accent, #2f6fed)",
  textDecoration: "none",
  fontWeight: "500",
};

const detailTitleStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: "700",
  lineHeight: 1.4,
  color: "var(--dsh-text, #1f2937)",
  userSelect: "text",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
  padding: "10px",
  background: "var(--dsh-surface-muted, #f9fafb)",
  borderRadius: "6px",
  border: "1px solid var(--dsh-border, #e3e6ea)",
};

const fieldItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsh-text-secondary, #6b7280)",
};

const fieldValueStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: "600",
  color: "var(--dsh-text, #1f2937)",
  userSelect: "text",
};

const descBoxStyle: CSSProperties = {
  padding: "10px",
  background: "var(--dsh-surface, #fff)",
  border: "1px solid var(--dsh-border, #e3e6ea)",
  borderRadius: "6px",
  fontSize: "12px",
  lineHeight: 1.6,
  color: "var(--dsh-text, #374151)",
  userSelect: "text",
  overflowWrap: "break-word",
  maxHeight: "260px",
  overflowY: "auto",
};

const emptyDescStyle: CSSProperties = {
  padding: "12px",
  textAlign: "center",
  color: "var(--dsh-text-secondary, #9ca3af)",
  fontSize: "12px",
  border: "1px dashed var(--dsh-border, #e3e6ea)",
  borderRadius: "6px",
};

const paginationBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: "10px",
  paddingTop: "8px",
  borderTop: "1px solid var(--dsh-border, #e3e6ea)",
};

const pageBtnStyle = (disabled: boolean): CSSProperties => ({
  border: "1px solid var(--dsh-border, #e3e6ea)",
  background: disabled ? "var(--dsh-surface-muted, #f3f4f6)" : "var(--dsh-surface, #fff)",
  color: disabled ? "var(--dsh-text-secondary, #9ca3af)" : "var(--dsh-text, #1f2937)",
  cursor: disabled ? "not-allowed" : "pointer",
  padding: "3px 10px",
  fontSize: "12px",
  borderRadius: "4px",
  opacity: disabled ? 0.6 : 1,
});

const pageInfoStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsh-text-secondary, #6b7280)",
};
