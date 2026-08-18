import { ZentaoToolView } from "./toolview.js";
import { ZentaoFooterAction } from "./panel.js";
export const inject = ["slots"];
export function apply(ctx) {
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
        name: "tool.call.toolview",
        key: "zentao",
    }, ZentaoToolView));
    ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
        name: "sidebar.footer.action",
        id: "zentao",
        label: () => "禅道",
        // owner props { wide } 由 sidebar shell 传入
    }, ZentaoFooterAction));
}
//# sourceMappingURL=index.js.map