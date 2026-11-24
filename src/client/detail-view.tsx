/** 详情查看视图：点击行后经 /__dsh-zentao__/detail 拉取完整对象，按类型展示禅道全量字段。 */
import { createElement, useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { T } from "./theme.ts";
import { CASE_TYPE_MAP, STORY_STAGE_MAP, type ViewKey } from "../views.ts";
import { sanitizeAndFormatHtml } from "./sanitize.ts";
import { PriBadge, StatusBadge } from "./badges.tsx";

const DETAIL_URL = "/__dsh-zentao__/detail";

// 详情页专属样式（token 驱动；与 panel 的通用样式解耦）
const backBtnStyle: CSSProperties = {
  border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer",
  padding: "4px 10px", fontSize: "12px", borderRadius: "6px", color: T.textSecondary,
};
const openLinkStyle: CSSProperties = {
  fontSize: "12px", color: T.accent, textDecoration: "none", fontWeight: 500,
};
const idTagStyle: CSSProperties = {
  background: T.accentSoft, color: T.accent, fontSize: "11px", fontWeight: "700",
  padding: "1px 6px", borderRadius: T.radiusXs, fontFamily: "monospace",
};
const detailTitleStyle: CSSProperties = {
  fontSize: "15px", fontWeight: "600", color: T.text, lineHeight: 1.4,
};
const gridStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 12px",
};
const sectionTitleStyle: CSSProperties = {
  fontSize: "12px", fontWeight: "600", color: T.textSecondary,
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
};
const descBoxStyle: CSSProperties = {
  padding: "10px 12px", fontSize: "13px", lineHeight: 1.7, color: T.text,
  background: T.surfaceMuted, border: `1px solid ${T.borderSubtle}`, borderRadius: T.radiusSm,
  overflowWrap: "break-word", wordBreak: "break-word",
};
const emptyDescStyle: CSSProperties = {
  padding: "10px", color: T.textSecondary, fontSize: "13px",
  border: `1px dashed ${T.border}`, borderRadius: "6px", textAlign: "center",
};
const hintStyle: CSSProperties = {
  fontSize: "12px", color: T.textSecondary, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6,
};
const fieldItemStyle: CSSProperties = {
  display: "flex", flexDirection: "column", gap: "2px", minWidth: 0,
};
const fieldLabelStyle: CSSProperties = {
  fontSize: "11px", color: T.textTertiary,
};
const fieldValueStyle: CSSProperties = {
  fontSize: "12px", color: T.text, overflowWrap: "break-word",
};

function FieldItem({ label, value }: { label: string; value: string }) {
  return createElement("div", { style: fieldItemStyle },
    createElement("span", { style: fieldLabelStyle }, label),
    createElement("span", { style: fieldValueStyle }, value),
  );
}

/** Bug 解决方案中文映射。 */
export const RESOLUTION_MAP: Record<string, string> = {
  fixed: "已解决", wontfix: "不予解决", postponed: "延期处理",
  bydesign: "设计如此", duplicate: "重复Bug", external: "外部原因",
  notrepro: "无法重现", tostory: "转需求",
};

/** 详情页描述区块。 */
export interface DescSection {
  label: string;
  html: string;
}

/**
 * 详情查看视图：点击行后经 /__dsh-zentao__/detail 拉取完整对象，
 * 按类型展示禅道全量字段（列表行数据先行渲染，详情到达后合并覆盖）。
 * testtask 无 get 子命令（服务端 unsupported），仅用列表行字段展示。
 */
export function DetailView({
  row,
  type,
  serverUrl,
  onBack,
}: {
  row: Record<string, unknown>;
  type: ViewKey;
  serverUrl?: string | undefined;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setDetail(null);
    setLoadError(null);
    if (type === "testtasks") return; // 无 get 子命令
    fetch(`${DETAIL_URL}?view=${type}&id=${row.id}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}（服务端未包含详情接口，请重启 DSH 后重试）`);
        return r.json() as Promise<{ data?: Record<string, unknown>; error?: string; unsupported?: boolean }>;
      })
      .then((d) => {
        if (!alive) return;
        if (d.error !== undefined) setLoadError(d.error);
        else if (d.data !== undefined) setDetail(d.data);
        else setLoadError("详情数据缺失（CLI 返回为空）"); // 防加载中永不消失
      })
      .catch((err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : "网络错误"); });
    return () => { alive = false; };
  }, [type, row.id]);

  // 合并：列表行打底（含 assignedToRealName 等裁剪列），详情字段覆盖
  const m: Record<string, unknown> = { ...row, ...(detail ?? {}) };
  const isTask = type === "tasks";
  const isStory = type === "stories";
  const isCase = type === "testcases";
  const isTesttask = type === "testtasks";
  const title = String(isTask ? m.name ?? m.id : m.title ?? m.id);
  const assigned = String(row.assignedToRealName ?? m.assignedTo ?? m.owner ?? "未指派");
  const status = String(m.status ?? "");
  const pri = m.pri;
  const webUrl = serverUrl
    ? `${serverUrl.replace(/\/+$/, "")}/${isTask ? "task" : isStory ? "story" : isTesttask ? "testtask" : "case"}-view-${m.id}.html`
    : undefined;

  // 按类型的字段网格（undefined/空值自动跳过）
  const fmtDate = (v: unknown): string | undefined => {
    const s = String(v ?? "");
    return s === "" || s.startsWith("0000-00-00") ? undefined : s.slice(0, 10);
  };
  const fields: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown, fmt?: (v: unknown) => string | undefined): void => {
    const v = fmt !== undefined ? fmt(value) : value === undefined || value === null || value === "" ? undefined : String(value);
    if (v !== undefined) fields.push({ label, value: v });
  };
  if (isTask) {
    push("指派给", assigned);
    push("截止日期", m.deadline, fmtDate);
    push("工时 预计/消耗/剩余", `${m.estimate ?? 0}h / ${m.consumed ?? 0}h / ${m.left ?? 0}h`);
    push("实际开始", m.realStarted, fmtDate);
    push("实际完成", m.finishedDate, fmtDate);
    push("创建人", m.openedBy);
    push("创建时间", m.openedDate, fmtDate);
    push("由谁关闭", m.closedBy);
    push("关闭时间", m.closedDate, fmtDate);
    push("取消者", m.canceledBy);
  } else if (type === "bugs") {
    push("指派给", assigned);
    push("严重程度", m.severity !== undefined && m.severity !== "" ? `级别 ${m.severity}` : undefined);
    push("影响版本", Array.isArray(m.openedBuild) ? (m.openedBuild as string[]).join(", ") : m.openedBuild);
    push("解决方案", m.resolution !== undefined && m.resolution !== "" ? RESOLUTION_MAP[String(m.resolution)] ?? String(m.resolution) : undefined);
    push("解决版本", m.resolvedBuild);
    push("重现频率", m.frequency !== undefined && m.frequency !== "" ? String(m.frequency) : undefined);
    push("所属模块", m.module !== undefined && String(m.module) !== "0" && m.module !== "" ? String(m.module) : undefined);
    push("创建人", m.openedBy);
    push("创建时间", m.openedDate, fmtDate);
    push("解决者", m.resolvedBy);
    push("解决时间", m.resolvedDate, fmtDate);
    push("关闭时间", m.closedDate, fmtDate);
    push("激活次数", m.activatedCount !== undefined && String(m.activatedCount) !== "0" ? String(m.activatedCount) : undefined);
  } else if (isStory) {
    push("指派给", assigned);
    push("阶段", m.stage !== undefined && m.stage !== "" ? STORY_STAGE_MAP[String(m.stage)] ?? String(m.stage) : undefined);
    push("所属计划", m.plan !== undefined && String(m.plan) !== "0" && m.plan !== "" ? String(m.plan) : undefined);
    push("来源", m.source !== undefined && m.source !== "" ? String(m.source) : undefined);
    push("分类", m.category !== undefined && m.category !== "" ? String(m.category) : undefined);
    push("创建人", m.openedBy);
    push("创建时间", m.openedDate, fmtDate);
    push("评审人", m.reviewedBy);
    push("关闭时间", m.closedDate, fmtDate);
  } else if (isTesttask) {
    push("负责人", assigned);
    push("测试版本 (build)", m.build);
    push("轮次", [m.begin, m.end].filter((d) => d !== undefined && d !== "").map(String).join(" ~ "));
    push("实际开始", m.realBegan, fmtDate);
    push("实际完成", m.realFinishedDate, fmtDate);
  } else if (isCase) {
    push("用例类型", m.type !== undefined && m.type !== "" ? CASE_TYPE_MAP[String(m.type)] ?? String(m.type) : undefined);
    push("适用阶段", m.stage !== undefined && m.stage !== "" ? String(m.stage) : undefined);
    push("最近执行", m.lastRunResult !== undefined && m.lastRunResult !== ""
      ? `${m.lastRunResult === "pass" ? "通过" : m.lastRunResult === "fail" ? "失败" : String(m.lastRunResult)}${m.lastRunDate !== undefined && m.lastRunDate !== "" ? ` · ${String(m.lastRunDate).slice(0, 10)}` : ""}${m.lastRunner !== undefined && m.lastRunner !== "" ? ` · ${String(m.lastRunner)}` : ""}`
      : undefined);
    push("创建人", m.openedBy);
    push("创建时间", m.openedDate, fmtDate);
  }

  // 描述区块（按类型；详情到达后内容完整）
  const sections: DescSection[] = [];
  const addSection = (label: string, v: unknown): void => {
    const html = String(v ?? "").trim();
    if (html !== "") sections.push({ label, html });
  };
  if (isTask) {
    addSection("任务描述", m.desc);
  } else if (type === "bugs") {
    addSection("重现步骤", m.steps);
  } else if (isStory) {
    addSection("需求描述", m.spec);
    addSection("验收标准", m.verify);
  } else if (isCase) {
    addSection("前置条件", m.precondition);
    addSection("测试步骤", m.steps);
  } else {
    addSection("测试说明", m.desc);
  }

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
        createElement("span", { style: idTagStyle }, `#${m.id}`),
        createElement(PriBadge, { pri }),
        createElement(StatusBadge, { status }),
      ),
      createElement("div", { style: detailTitleStyle }, title),
    ),
    // 字段网格：列表行先渲染，详情到达后字段补全
    createElement("div", { style: gridStyle },
      ...fields.map((f) => createElement(FieldItem, { key: f.label, label: f.label, value: f.value })),
    ),
    detail === null && type !== "testtasks" && loadError === null &&
      createElement("div", { style: hintStyle }, "详情加载中…"),
    loadError !== null && createElement("div", { style: hintStyle }, `详情加载失败（${loadError}），以下为列表摘要`),
    sections.length > 0 && createElement("div", { style: { marginTop: "4px", display: "flex", flexDirection: "column", gap: "10px" } },
      createElement("style", null, `
        .dsh-zentao-desc img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 6px 0;
          cursor: zoom-in;
          display: block;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          border: 1px solid ${T.border};
        }
        .dsh-zentao-desc p { margin: 4px 0; }
      `),
      ...sections.map((sec) => createElement("div", { key: sec.label },
        createElement("div", { style: sectionTitleStyle }, sec.label),
        createElement("div", {
          className: "dsh-zentao-desc",
          style: descBoxStyle,
          onClick: (e: MouseEvent<HTMLDivElement>) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              const src = (target as HTMLImageElement).src;
              if (src) window.open(src, "_blank");
            }
          },
          dangerouslySetInnerHTML: { __html: sanitizeAndFormatHtml(sec.html) },
        }),
      )),
    ),
    sections.length === 0 && detail !== null && createElement("div", { style: emptyDescStyle }, "暂无详细描述"),
  );
}

