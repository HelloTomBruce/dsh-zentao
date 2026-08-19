/**
 * 侧栏底部"禅道"入口（sidebar.footer.action）+ 弹出面板。面板展示
 * 我的任务 / 我的 Bug / 进行中项目三个区块，数据来自同源
 * /__dsh-zentao__/overview。纯函数/类型见 panel.ts。
 */
import { createElement, useEffect, useState } from "react";
const OVERVIEW_URL = "/__dsh-zentao__/overview";
const LOGIN_URL = "/__dsh-zentao__/login";
function useOverview() {
    const [data, setData] = useState(null);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        // 首次挂载走服务端 60s 缓存（秒开）；显式 refresh（登录后）强制刷新。
        const url = tick === 0 ? OVERVIEW_URL : `${OVERVIEW_URL}?fresh=1`;
        fetch(url, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => { if (alive)
            setData(d); })
            .catch((err) => {
            if (!alive)
                return;
            const message = err instanceof Error && /^HTTP /.test(err.message) ? err.message : "网络错误";
            setData({ myTasks: [], myBugs: [], activeProjects: [], error: message });
        });
        return () => { alive = false; };
    }, [tick]);
    return { data, refresh: () => setTick((t) => t + 1) };
}
function StatusBadge({ status }) {
    const color = status === "doing" || status === "active"
        ? "var(--dsh-accent, #2f6fed)"
        : status === "closed" || status === "done"
            ? "var(--dsh-text-secondary, #6b7280)"
            : "var(--dsh-warning, #b45309)";
    return createElement("span", { style: { color, fontWeight: "600" } }, status);
}
/** Tab 内容区：空态或行表格（最多 20 行）。 */
function RowList({ rows, nameKey }) {
    return rows.length === 0
        ? createElement("div", { style: emptyStyle }, "暂无数据")
        : createElement("table", { style: tableStyle }, createElement("tbody", null, ...rows.slice(0, 20).map((row, i) => createElement("tr", { key: i }, ...[
            createElement("td", { key: "n", style: tdStyle }, String(row[nameKey] ?? row.id)),
            createElement("td", { key: "s", style: tdStyle }, createElement(StatusBadge, { status: row.status })),
        ]))));
}
const sectionTitleStyle = {
    fontSize: "12px", fontWeight: "600", color: "var(--dsh-text-secondary, #6b7280)",
    marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
};
const tableStyle = {
    width: "100%", borderCollapse: "collapse", fontSize: "13px",
};
const tdStyle = {
    padding: "4px 8px 4px 0", borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
    maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const emptyStyle = {
    padding: "10px", color: "var(--dsh-text-secondary, #6b7280)", fontSize: "13px",
    border: "1px dashed var(--dsh-border, #e3e6ea)", borderRadius: "6px", textAlign: "center",
};
function LoginField({ label, value, set, placeholder, type = "text" }) {
    return createElement("label", { style: loginFieldStyle }, createElement("span", { style: loginLabelStyle }, label), createElement("input", {
        type, value, placeholder,
        onChange: (e) => set(e.target.value),
        style: loginInputStyle,
    }));
}
/** 面板内登录表单：提交到同源 /__dsh-zentao__/login，成功后回调刷新数据。 */
function LoginForm({ onLoggedIn }) {
    const [server, setServer] = useState("");
    const [account, setAccount] = useState("");
    const [password, setPassword] = useState("");
    const [token, setToken] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const submit = () => {
        if (pending)
            return;
        setPending(true);
        setError(null);
        fetch(LOGIN_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ server, account, password: password || undefined, token: token || undefined }),
        })
            .then((r) => r.json())
            .then((d) => {
            if (d.ok === true)
                onLoggedIn();
            else
                setError(d.error ?? "登录失败");
        })
            .catch(() => setError("网络错误"))
            .finally(() => setPending(false));
    };
    return createElement("div", null, createElement("div", { style: sectionTitleStyle }, "登录禅道"), createElement(LoginField, { label: "服务地址", value: server, set: setServer, placeholder: "http://zentao.example.com" }), createElement(LoginField, { label: "账号", value: account, set: setAccount }), createElement(LoginField, { label: "密码", value: password, set: setPassword, type: "password" }), createElement(LoginField, { label: "Token（选填，优先于密码）", value: token, set: setToken }), error !== null && createElement("div", { style: loginErrorStyle }, error), createElement("button", { onClick: submit, disabled: pending, style: loginSubmitStyle(pending) }, pending ? "登录中…" : "登录"));
}
const loginFieldStyle = { display: "block", marginBottom: "8px" };
const loginLabelStyle = {
    display: "block", fontSize: "12px", color: "var(--dsh-text-secondary, #6b7280)", marginBottom: "3px",
};
const loginInputStyle = {
    width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: "13px",
    border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "6px",
    background: "var(--dsh-surface, #fff)", color: "inherit",
};
const loginErrorStyle = {
    fontSize: "12px", color: "var(--dsh-danger, #dc2626)", margin: "4px 0 8px",
    whiteSpace: "pre-wrap", wordBreak: "break-all",
};
const loginSubmitStyle = (pending) => ({
    width: "100%", padding: "7px 0", fontSize: "13px", fontWeight: "600",
    border: "none", borderRadius: "6px", cursor: pending ? "default" : "pointer",
    background: "var(--dsh-accent, #2f6fed)", color: "#fff", opacity: pending ? 0.7 : 1,
});
function PanelBody() {
    const { data, refresh } = useOverview();
    const [showLogin, setShowLogin] = useState(false);
    const [tab, setTab] = useState("projects");
    if (data === null)
        return createElement("div", { style: emptyStyle }, "加载中…");
    if (data.error !== undefined) {
        return createElement("div", null, createElement("div", { style: emptyStyle }, `禅道数据获取失败：${data.error}`), createElement("div", { style: { height: "10px" } }), createElement(LoginForm, { onLoggedIn: refresh }));
    }
    const tabs = [
        { key: "projects", label: `项目（${data.activeProjects.length}）` },
        { key: "tasks", label: `我的任务（${data.myTasks.length}）` },
        { key: "bugs", label: `我的 Bug（${data.myBugs.length}）` },
    ];
    return createElement("div", null, createElement("div", { style: tabBarStyle, role: "tablist", "aria-label": "禅道概览分类" }, ...tabs.map((t) => createElement("button", {
        key: t.key,
        role: "tab",
        "aria-selected": tab === t.key,
        onClick: () => setTab(t.key),
        style: tabStyle(tab === t.key),
    }, t.label))), createElement("div", { role: "tabpanel", style: { minHeight: "120px" } }, tab === "projects" && createElement(RowList, { rows: data.activeProjects, nameKey: "name" }), tab === "tasks" && createElement(RowList, { rows: data.myTasks, nameKey: "name" }), tab === "bugs" && createElement(RowList, { rows: data.myBugs, nameKey: "title" })), createElement("div", { style: { height: "10px" } }), showLogin
        ? createElement(LoginForm, { onLoggedIn: () => { setShowLogin(false); refresh(); } })
        : createElement("button", { onClick: () => setShowLogin(true), style: reloginLinkStyle }, "重新登录 / 切换账号"));
}
const tabBarStyle = {
    display: "flex", gap: "4px", marginBottom: "12px",
    borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
};
const tabStyle = (active) => ({
    border: "none", background: "transparent", cursor: "pointer",
    padding: "6px 10px", fontSize: "13px",
    fontWeight: active ? "600" : "400",
    color: active ? "var(--dsh-accent, #2f6fed)" : "var(--dsh-text-secondary, #6b7280)",
    borderBottom: active ? "2px solid var(--dsh-accent, #2f6fed)" : "2px solid transparent",
    marginBottom: "-1px",
});
const reloginLinkStyle = {
    border: "none", background: "transparent", cursor: "pointer", padding: "0",
    fontSize: "12px", color: "var(--dsh-text-secondary, #6b7280)", textDecoration: "underline",
};
/** 侧栏入口图标：清单/看板造型，currentColor 随主题。 */
function ZentaoIcon({ size = 14 }) {
    return createElement("svg", {
        width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true,
    }, createElement("rect", { x: 1.75, y: 2.25, width: 12.5, height: 11.5, rx: 2, stroke: "currentColor", strokeWidth: 1.4 }), createElement("path", { d: "M4.75 5.75h6.5M4.75 8.25h6.5M4.75 10.75h4", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }));
}
/** 侧栏底部入口：wide 时显示图标+文字行，rail 时只显示图标；点击弹出面板。 */
export function ZentaoFooterAction({ wide }) {
    const [open, setOpen] = useState(false);
    // Esc 关闭 + 遮罩点击关闭（a11y：role=dialog/aria-modal）。
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => { if (e.key === "Escape")
            setOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);
    return createElement("div", { style: { position: "relative" } }, createElement("button", {
        onClick: () => setOpen(!open),
        style: footerActionStyle(wide),
        title: "禅道",
        "data-dsh-zentao": "trigger",
    }, createElement(ZentaoIcon, null), wide ? createElement("span", null, "禅道") : null), open && createElement("div", {
        style: overlayStyle,
        onClick: () => setOpen(false),
        "aria-label": "关闭禅道概览",
    }, createElement("div", {
        style: panelStyle,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "禅道概览",
        onClick: (e) => e.stopPropagation(),
    }, createElement("div", { style: panelHeaderStyle }, createElement("span", { style: { fontWeight: "600" } }, "禅道概览"), createElement("button", {
        onClick: () => setOpen(false),
        style: closeStyle,
        "aria-label": "关闭",
    }, "×")), createElement(PanelBody, null))));
}
const footerActionStyle = (wide) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
    width: wide ? "100%" : "40px", height: "32px",
    border: "none", background: "transparent", cursor: "pointer",
    fontSize: "13px", color: "var(--dsh-text-secondary, #6b7280)",
});
const overlayStyle = {
    position: "fixed", inset: "0", zIndex: 999,
    background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
};
const panelStyle = {
    width: "min(520px, 92vw)", maxHeight: "70vh", overflowY: "auto",
    background: "var(--dsh-surface, #fff)", border: "1px solid var(--dsh-border, #e3e6ea)",
    borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: "16px 20px",
};
const panelHeaderStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: "12px",
};
const closeStyle = {
    border: "none", background: "transparent", fontSize: "18px", cursor: "pointer",
    color: "var(--dsh-text-secondary, #6b7280)", padding: "0 4px",
};
//# sourceMappingURL=panel.js.map