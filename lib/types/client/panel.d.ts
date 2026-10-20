import type { CSSProperties } from "react";
/** Tab 标题栏：图标 + 标题 + 未关闭 Bug 计数徽标（数据走服务端 60s 缓存）。 */
export declare function ZentaoPanelTitle(): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement>;
/** Tab 正文：按工作区绑定展示 任务 / Bug 两视图 + 登录入口。 */
export declare function ZentaoPanelBody(): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement> | import("react").FunctionComponentElement<{
    workspace: {
        path: string;
        title: string;
    };
}>;
//# sourceMappingURL=panel.d.ts.map