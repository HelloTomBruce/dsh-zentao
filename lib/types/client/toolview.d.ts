import type { CSSProperties } from "react";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
interface ListPayload {
    module: string;
    action: string;
    data: unknown[];
    count?: number;
}
interface ObjectPayload {
    module: string;
    action: string;
    data: object;
    count?: number;
}
/** 工具卡主组件：从 block.meta 提取 payload → 表格/详情/降级。 */
export declare function ZentaoToolView({ block }: ToolCallViewProps): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement> | import("react").FunctionComponentElement<{
    payload: ListPayload;
}> | import("react").FunctionComponentElement<{
    payload: ObjectPayload;
}>;
export {};
//# sourceMappingURL=toolview.d.ts.map