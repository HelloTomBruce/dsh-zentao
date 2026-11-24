import type { CSSProperties } from "react";
/**
 * 富文本消毒 + 排版。安全边界：
 * ① DOMPurify 白名单消毒（剥事件处理器/javascript: 协议/未知标签，文本保留）
 * ② markdown 图片的 alt/url 拼接属性前经 escapeHtml
 * ③ 图片代理重写在消毒**之后**执行（产出 src 为本插件同源受控地址）
 */
export declare function sanitizeAndFormatHtml(text: string): string;
/** Tab 标题栏：图标 + 标题 + 未关闭 Bug 计数徽标（默认未关闭筛选，数据走服务端 60s 缓存）。 */
export declare function ZentaoPanelTitle(): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement>;
/** Tab 正文：按工作区绑定展示各视图（按视图懒加载：切 Tab 才拉对应数据）+ 状态筛选 + 详情查看 + 登录入口。 */
export declare function ZentaoPanelBody(): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement> | import("react").FunctionComponentElement<{
    workspace: {
        path: string;
        title: string;
    };
    onRefresh: () => void;
}>;
//# sourceMappingURL=panel.d.ts.map