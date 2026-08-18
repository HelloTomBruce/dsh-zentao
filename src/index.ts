import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { applyTools } from "./tools.ts";
import { registerOverviewApi } from "./api.ts";
import { ensureLocalConfig } from "./lib/config.ts";

export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void | (() => void) {
  // 插件自包含配置：把用户的 zentao.json 复制到插件安装目录（幂等，失败不阻塞）。
  ensureLocalConfig();
  const disposers = [applyTools(ctx), registerOverviewApi(ctx)];
  return () => {
    for (const dispose of disposers.reverse()) dispose?.();
  };
}
