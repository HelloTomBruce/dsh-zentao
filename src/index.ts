import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { applyTools } from "./tools.ts";

export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void {
  ctx.effect(() => applyTools(ctx), "dsh-zentao: tools");
}
