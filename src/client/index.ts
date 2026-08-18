import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { ZentaoToolView } from "./toolview.tsx";
import { ZentaoFooterAction } from "./panel.tsx";

export const inject = ["slots"];

export function apply(ctx: ClientContext): void {
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
