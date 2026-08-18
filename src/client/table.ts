/**
 * zentao 工具卡的表格渲染：从工具 result 的文本 payload（JSON）重建列，
 * 渲染为自适应表格。live 与 replay 都从持久化的 tool/call + tool/result
 * 事件恢复（工具输出以 JSON 文本落盘），无自定义 session 事件。
 */

export interface ToolResultPayload {
  module: string;
  action: string;
  data: unknown;
  count?: number;
}

/** 从工具 result 文本提取 JSON payload；失败返回 null（降级为纯文本）。 */
export function extractData(text: string): ToolResultPayload | null {
  try {
    const parsed = JSON.parse(text) as ToolResultPayload;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ColumnDef {
  key: string;
  label: string;
  type: "id" | "status" | "text";
}

const STATUS_LABELS: Record<string, string> = {
  active: "激活", doing: "进行中", wait: "待开始", closed: "已关闭",
  resolved: "已解决", done: "已完成", pause: "已暂停", cancel: "已取消",
};

/** 行数组 → 列定义；对象 → key/value 两列。 */
export function rowsToColumns(data: unknown): ColumnDef[] {
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first !== "object" || first === null) return [];
    const keys = Object.keys(first as Record<string, unknown>).slice(0, 8);
    return keys.map((key) => ({
      key,
      label: key,
      type: key === "id" ? ("id" as const) : key === "status" ? ("status" as const) : ("text" as const),
    }));
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    return Object.keys(obj).slice(0, 12).map((key) => ({
      key, label: key, type: "text" as const,
    }));
  }
  return [];
}

/** 单元格取值（对象取 key；数组行内取 key）。 */
export function cellValue(row: unknown, key: string): unknown {
  if (typeof row !== "object" || row === null) return row;
  return (row as Record<string, unknown>)[key];
}

/** 状态徽标文字（未知状态原样显示）。 */
export function statusLabel(status: unknown): string {
  const s = String(status);
  return STATUS_LABELS[s] ?? s;
}
