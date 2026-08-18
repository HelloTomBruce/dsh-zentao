/**
 * zentao 工具卡的表格渲染：从工具 result 的 presentationMeta（block.meta）
 * 重建列，渲染为自适应表格。meta 是 harness 写入的 presentation payload
 * （仅供 UI bridge，不进模型上下文），live 与 replay 都由 tool/result 事件
 * 持久化携带。
 */
export interface ToolResultPayload {
    module: string;
    action: string;
    data: unknown;
    count?: number;
}
/**
 * 从 block.meta（presentationMeta 返回值）安全解析 payload；
 * meta 缺失 / 非对象 / data 缺失 → 返回 null（降级为纯文本）。
 */
export declare function parseMeta(meta: unknown): ToolResultPayload | null;
export interface ColumnDef {
    key: string;
    label: string;
    type: "id" | "status" | "text";
}
/** 行数组 → 列定义；对象 → key/value 两列。 */
export declare function rowsToColumns(data: unknown): ColumnDef[];
/** 单元格取值（对象取 key；数组行内取 key）。 */
export declare function cellValue(row: unknown, key: string): unknown;
/** 状态徽标文字（未知状态原样显示）。 */
export declare function statusLabel(status: unknown): string;
//# sourceMappingURL=table.d.ts.map