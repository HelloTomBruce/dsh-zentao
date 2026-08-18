import { applyTools } from "./tools.js";
import { registerOverviewApi } from "./api.js";
import { ensureLocalConfig } from "./lib/config.js";
export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];
export function apply(ctx) {
    // 插件自包含配置：把用户的 zentao.json 复制到插件安装目录（幂等，失败不阻塞）。
    ensureLocalConfig();
    const disposers = [applyTools(ctx), registerOverviewApi(ctx)];
    return () => {
        for (const dispose of disposers.reverse())
            dispose?.();
    };
}
//# sourceMappingURL=index.js.map