/**
 * zentao 工具卡：从 tool/result 的 presentationMeta（block.meta）读取 payload，
 * 列表渲染为表格，详情渲染为键值列表。meta 缺失/解析失败降级为纯文本。
 */
import { useMemo } from "react";
import { createElement } from "react";
import { parseMeta, rowsToColumns, cellValue, statusLabel } from "./table.js";
function cellStyle(kind) {
    if (kind === "id")
        return { color: "var(--dsh-text-secondary, #6b7280)", fontVariantNumeric: "tabular-nums" };
    if (kind === "status")
        return { fontWeight: "600" };
    return {};
}
function TableView({ payload }) {
    const cols = useMemo(() => rowsToColumns(payload.data), [payload.data]);
    if (cols.length === 0) {
        return createElement("div", { style: emptyStyle }, "（空列表）");
    }
    return createElement("div", { style: { overflowX: "auto", margin: "8px 0" } }, createElement("table", { style: tableStyle }, createElement("thead", null, createElement("tr", null, ...cols.map((c) => createElement("th", { key: c.key, style: thStyle }, c.label)))), createElement("tbody", null, ...payload.data.map((row, i) => createElement("tr", { key: i }, ...cols.map((c) => createElement("td", { key: c.key, style: { ...tdStyle, ...cellStyle(c.type) } }, renderCell(cellValue(row, c.key), c.type))))))));
}
function renderCell(value, type) {
    if (value === null || value === undefined)
        return "—";
    if (type === "status")
        return statusLabel(value);
    if (type === "text" && typeof value === "object")
        return JSON.stringify(value);
    if (typeof value === "boolean")
        return value ? "是" : "否";
    return String(value);
}
function DetailView({ payload }) {
    const cols = rowsToColumns(payload.data);
    return createElement("div", { style: { margin: "8px 0", border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "8px", overflow: "hidden" } }, ...cols.map((c) => createElement("div", { key: c.key, style: detailRowStyle }, createElement("span", { style: detailKeyStyle }, c.label), createElement("span", { style: detailValueStyle }, renderCell(cellValue(payload.data, c.key), c.type)))));
}
const tableStyle = {
    width: "100%", borderCollapse: "collapse", fontSize: "13px",
    border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "8px",
};
const thStyle = {
    textAlign: "left", padding: "6px 10px", fontWeight: "600",
    borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
    color: "var(--dsh-text-secondary, #6b7280)", fontSize: "12px", whiteSpace: "nowrap",
};
const tdStyle = {
    padding: "6px 10px", borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
    maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const emptyStyle = {
    margin: "8px 0", padding: "12px", color: "var(--dsh-text-secondary, #6b7280)", fontSize: "13px",
    border: "1px dashed var(--dsh-border, #e3e6ea)", borderRadius: "8px", textAlign: "center",
};
const detailRowStyle = {
    display: "flex", gap: "12px", padding: "6px 10px",
    borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
};
const detailKeyStyle = {
    minWidth: "120px", color: "var(--dsh-text-secondary, #6b7280)", fontWeight: "600", fontSize: "12px",
};
const detailValueStyle = { flex: "1", wordBreak: "break-all", fontSize: "13px" };
/** 工具卡主组件：从 block.meta 提取 payload → 表格/详情/降级。 */
export function ZentaoToolView({ block }) {
    const meta = useMemo(() => block.meta, [block]);
    const payload = useMemo(() => (meta === undefined ? null : parseMeta(meta)), [meta]);
    if (payload === null) {
        // running 态（tool/call 事件先于 tool/result 到达）无 meta；结果态 meta 缺失才是格式问题。
        const isRunning = block.kind === undefined;
        return createElement("div", { style: emptyStyle }, isRunning ? "zentao 调用执行中…" : "zentao 调用结果不可用（meta 缺失或格式不符）");
    }
    if (Array.isArray(payload.data)) {
        return createElement(TableView, { payload: payload });
    }
    if (typeof payload.data === "object" && payload.data !== null) {
        return createElement(DetailView, { payload: payload });
    }
    return createElement("div", { style: emptyStyle }, String(payload.data));
}
//# sourceMappingURL=toolview.js.map