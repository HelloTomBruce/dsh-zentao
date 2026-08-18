/**
 * zentao 工具卡的表格渲染：从工具 result 的 presentationMeta（block.meta）
 * 重建列，渲染为自适应表格。meta 是 harness 写入的 presentation payload
 * （仅供 UI bridge，不进模型上下文），live 与 replay 都由 tool/result 事件
 * 持久化携带。
 */
/**
 * 从 block.meta（presentationMeta 返回值）安全解析 payload；
 * meta 缺失 / 非对象 / data 缺失 → 返回 null（降级为纯文本）。
 */
export function parseMeta(meta) {
    if (typeof meta !== "object" || meta === null)
        return null;
    const obj = meta;
    if (typeof obj.module !== "string" || typeof obj.action !== "string")
        return null;
    if (!("data" in obj))
        return null;
    return {
        module: obj.module,
        action: obj.action,
        data: obj.data,
        ...(typeof obj.count === "number" ? { count: obj.count } : {}),
    };
}
const STATUS_LABELS = {
    active: "激活", doing: "进行中", wait: "待开始", closed: "已关闭",
    resolved: "已解决", done: "已完成", pause: "已暂停", cancel: "已取消",
};
/** 行数组 → 列定义；对象 → key/value 两列。 */
export function rowsToColumns(data) {
    if (Array.isArray(data)) {
        const first = data[0];
        if (typeof first !== "object" || first === null)
            return [];
        const keys = Object.keys(first).slice(0, 8);
        return keys.map((key) => ({
            key,
            label: key,
            type: key === "id" ? "id" : key === "status" ? "status" : "text",
        }));
    }
    if (typeof data === "object" && data !== null) {
        const obj = data;
        return Object.keys(obj).slice(0, 12).map((key) => ({
            key, label: key, type: "text",
        }));
    }
    return [];
}
/** 单元格取值（对象取 key；数组行内取 key）。 */
export function cellValue(row, key) {
    if (typeof row !== "object" || row === null)
        return row;
    return row[key];
}
/** 状态徽标文字（未知状态原样显示）。 */
export function statusLabel(status) {
    const s = String(status);
    return STATUS_LABELS[s] ?? s;
}
//# sourceMappingURL=table.js.map