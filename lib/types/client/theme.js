/**
 * 面板设计 token：对齐 dsh 客户端主题系统（dsh-client-ui-theme 的 --dsw-alias-* /
 * --dsw-radius-* / --ds-ease-in-out），每项带 hex/rgba 兜底——旧版 dsh 未定义
 * 对应变量时自动回落，深浅色主题由宿主 token 自动适配。
 */
export const T = {
    /** 文本：主 / 次 / 弱 / 说明。 */
    text: "var(--dsw-alias-label-primary, #1f2329)",
    textSecondary: "var(--dsw-alias-label-secondary, #52607a)",
    textTertiary: "var(--dsw-alias-label-tertiary, #6b7280)",
    textCaption: "var(--dsw-alias-label-caption, #9aa3b2)",
    /** 边框：弱（l1）/ 常规（l2）/ 强调（l3）。 */
    borderSubtle: "var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06))",
    border: "var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
    borderStrong: "var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))",
    /** 背景：层 1（卡片）/ 层 2（浅底）。 */
    surface: "var(--dsw-alias-bg-layer-1, #ffffff)",
    surfaceMuted: "var(--dsw-alias-bg-layer-2, #f5f6f8)",
    /** 骨架屏底色。 */
    skeleton: "var(--dsw-alias-bg-skeleton, rgba(0, 0, 0, 0.05))",
    /** 悬停底色。 */
    hoverBg: "var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06))",
    /** 品牌主色 / 品牌浅底。 */
    accent: "var(--dsw-alias-state-business-primary, #4172e6)",
    accentSoft: "var(--dsw-alias-state-business-tertiary, #e8effd)",
    /** 状态色：危险 / 成功 / 警告（+浅底）。 */
    danger: "var(--dsw-alias-state-error-primary, #dc2626)",
    dangerSoft: "var(--dsw-alias-state-error-tertiary, #fee2e2)",
    success: "var(--dsw-alias-state-success-primary, #16a34a)",
    successSoft: "var(--dsw-alias-state-success-tertiary, #dcfce7)",
    warn: "var(--dsw-alias-state-warn-label, #b45309)",
    warnSoft: "var(--dsw-alias-state-warn-tertiary, #fef3c7)",
    /** 圆角：xs(4) / sm(8) / md(12)。 */
    radiusXs: "var(--dsw-radius-xs, 4px)",
    radiusSm: "var(--dsw-radius-sm, 8px)",
    radiusMd: "var(--dsw-radius-md, 12px)",
    /** 字号：13 / 12。 */
    fontXs: "var(--dsw-font-xs-13, 13px)",
    fontXxs: "var(--dsw-font-xxs-12, 12px)",
    /** 动效。 */
    easeInOut: "var(--ds-ease-in-out, cubic-bezier(0.4, 0, 0.2, 1))",
    durationFast: "var(--ds-transition-duration-fast, 0.1s)",
};
//# sourceMappingURL=theme.js.map