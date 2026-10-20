import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { applyTools } from "./tools.ts";
import { registerFileApi, registerLoginApi, registerOverviewApi } from "./api.ts";

export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void | (() => void) {
  const disposers = [applyTools(ctx), registerOverviewApi(ctx), registerLoginApi(ctx), registerFileApi(ctx)];
  return () => {
    for (const dispose of disposers.reverse()) dispose?.();
  };
}
