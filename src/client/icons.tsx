/**
 * 禅道概览图标：引导页卡片（28px）与 Tab 标题栏（14px）两档，
 * currentColor 随主题。造型沿用旧版清单/看板风格。
 */
import { createElement } from "react";
import type { SVGProps } from "react";

/** 右侧栏引导页卡片图标。 */
export function ZentaoGuideIcon(props: SVGProps<SVGSVGElement>) {
  return createElement(
    "svg",
    {
      width: 28,
      height: 28,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
    },
    createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
    createElement("path", { d: "M7 8h10M7 12h7" }),
    createElement("circle", { cx: 16.5, cy: 16, r: 2.5 }),
  );
}

/** Tab 标题栏小图标。 */
export function ZentaoTabIcon(props: SVGProps<SVGSVGElement>) {
  return createElement(
    "svg",
    {
      width: 14,
      height: 14,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
    },
    createElement("rect", { x: 1.75, y: 2.25, width: 12.5, height: 11.5, rx: 2 }),
    createElement("path", { d: "M4.75 5.75h6.5M4.75 8.25h6.5M4.75 10.75h4" }),
  );
}
