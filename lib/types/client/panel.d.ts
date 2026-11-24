import type { CSSProperties } from "react";
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