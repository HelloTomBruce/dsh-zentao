/**
 * 侧栏底部"禅道"入口（sidebar.footer.action）+ 弹出面板。面板展示
 * 我的任务 / 我的 Bug / 进行中项目三个区块，数据来自同源
 * /__dsh-zentao__/overview。纯函数/类型见 panel.ts。
 */
import { createElement, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { SidebarFooterActionOwnerProps } from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { OverviewResponse } from "./overview.ts";

const OVERVIEW_URL = "/__dsh-zentao__/overview";

function useOverview(): OverviewResponse | null {
  const [data, setData] = useState<OverviewResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(OVERVIEW_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<OverviewResponse> : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setData(d); })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error && /^HTTP /.test(err.message) ? err.message : "网络错误";
        setData({ myTasks: [], myBugs: [], activeProjects: [], error: message });
      });
    return () => { alive = false; };
  }, []);
  return data;
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "doing" || status === "active"
    ? "var(--dsh-accent, #2f6fed)"
    : status === "closed" || status === "done"
      ? "var(--dsh-text-secondary, #6b7280)"
      : "var(--dsh-warning, #b45309)";
  return createElement("span", { style: { color, fontWeight: "600" } }, status);
}

function Section({ title, rows, nameKey }: {
  title: string; rows: { id: string | number; status: string; [k: string]: unknown }[]; nameKey: "name" | "title";
}) {
  return createElement("div", { style: { marginBottom: "14px" } },
    createElement("div", { style: sectionTitleStyle }, `${title}（${rows.length}）`),
    rows.length === 0
      ? createElement("div", { style: emptyStyle }, "暂无数据")
      : createElement("table", { style: tableStyle },
          createElement("tbody", null,
            ...rows.slice(0, 20).map((row, i) =>
              createElement("tr", { key: i }, ...[
                createElement("td", { key: "n", style: tdStyle }, String(row[nameKey] ?? row.id)),
                createElement("td", { key: "s", style: tdStyle }, createElement(StatusBadge, { status: row.status })),
              ])))),
  );
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

function PanelBody() {
  const data = useOverview();
  if (data === null) return createElement("div", { style: emptyStyle }, "加载中…");
  if (data.error !== undefined) {
    return createElement("div", { style: emptyStyle },
      `禅道数据获取失败：${data.error}。请确认已安装并登录：npm i -g zentao-cli && zentao login`);
  }
  return createElement("div", null,
    createElement(Section, { title: "我的任务", rows: data.myTasks, nameKey: "name" }),
    createElement(Section, { title: "我的 Bug", rows: data.myBugs, nameKey: "title" }),
    createElement(Section, { title: "进行中的项目", rows: data.activeProjects, nameKey: "name" }),
  );
}

/** 侧栏底部入口：wide 时显示图标+文字行，rail 时只显示图标；点击弹出面板。 */
export function ZentaoFooterAction({ wide }: SidebarFooterActionOwnerProps) {
  const [open, setOpen] = useState(false);
  // Esc 关闭 + 遮罩点击关闭（a11y：role=dialog/aria-modal）。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return createElement("div", { style: { position: "relative" } },
    createElement("button", {
      onClick: () => setOpen(!open),
      style: footerActionStyle(wide),
      title: "禅道",
      "data-dsh-zentao": "trigger",
    }, wide ? "禅道" : "禅"),
    open && createElement("div", {
      style: overlayStyle,
      onClick: () => setOpen(false),
      "aria-label": "关闭禅道概览",
    },
      createElement("div", {
        style: panelStyle,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "禅道概览",
        onClick: (e: MouseEvent) => e.stopPropagation(),
      },
        createElement("div", { style: panelHeaderStyle },
          createElement("span", { style: { fontWeight: "600" } }, "禅道概览"),
          createElement("button", {
            onClick: () => setOpen(false),
            style: closeStyle,
            "aria-label": "关闭",
          }, "×")),
        createElement(PanelBody, null))),
  );
}

const footerActionStyle = (wide: boolean): CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: wide ? "100%" : "40px", height: "32px",
  border: "none", background: "transparent", cursor: "pointer",
  fontSize: "13px", color: "var(--dsh-text-secondary, #6b7280)",
});
const overlayStyle: CSSProperties = {
  position: "fixed", inset: "0", zIndex: 999,
  background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
};
const panelStyle: CSSProperties = {
  width: "min(520px, 92vw)", maxHeight: "70vh", overflowY: "auto",
  background: "var(--dsh-surface, #fff)", border: "1px solid var(--dsh-border, #e3e6ea)",
  borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: "16px 20px",
};
const panelHeaderStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  marginBottom: "12px",
};
const closeStyle: CSSProperties = {
  border: "none", background: "transparent", fontSize: "18px", cursor: "pointer",
  color: "var(--dsh-text-secondary, #6b7280)", padding: "0 4px",
};
