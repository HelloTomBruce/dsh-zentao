/** 状态/优先级徽标（RowList 与 DetailView 共用）。 */
import { createElement } from "react";
import { T } from "./theme.ts";

export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  wait: { label: "未开始", color: T.warn, bg: T.warnSoft },
  doing: { label: "进行中", color: T.accent, bg: T.accentSoft },
  done: { label: "已完成", color: T.success, bg: T.successSoft },
  pause: { label: "已暂停", color: T.textTertiary, bg: T.surfaceMuted },
  cancel: { label: "已取消", color: T.textTertiary, bg: T.surfaceMuted },
  closed: { label: "已关闭", color: T.textTertiary, bg: T.surfaceMuted },
  active: { label: "激活", color: T.danger, bg: T.dangerSoft },
  resolved: { label: "已解决", color: T.success, bg: T.successSoft },
  draft: { label: "草稿", color: T.textSecondary, bg: T.surfaceMuted },
  reviewing: { label: "评审中", color: T.warn, bg: T.warnSoft },
  launched: { label: "已启动", color: T.accent, bg: T.accentSoft },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? { label: status, color: T.textSecondary, bg: T.surfaceMuted };
  return createElement("span", {
    style: {
      fontSize: "11px",
      fontWeight: "600",
      padding: "1px 6px",
      lineHeight: "15px",
      borderRadius: T.radiusXs,
      background: meta.bg,
      color: meta.color,
      whiteSpace: "nowrap",
      flexShrink: 0,
      display: "inline-block",
    },
  }, meta.label);
}

export function PriBadge({ pri }: { pri: unknown }) {
  if (pri === undefined || pri === null || pri === "" || pri === "0" || pri === 0) return null;
  const p = String(pri);
  const theme = p === "1" ? { bg: T.dangerSoft, color: T.danger }
    : p === "2" ? { bg: T.warnSoft, color: T.warn }
      : p === "3" ? { bg: T.accentSoft, color: T.accent }
        : { bg: T.surfaceMuted, color: T.textSecondary };
  return createElement("span", {
    style: {
      fontSize: "11px",
      fontWeight: "700",
      padding: "1px 6px",
      borderRadius: T.radiusXs,
      background: theme.bg,
      color: theme.color,
      marginRight: "6px",
      lineHeight: "15px",
      display: "inline-block",
      flexShrink: 0,
    },
  }, `P${p}`);
}


