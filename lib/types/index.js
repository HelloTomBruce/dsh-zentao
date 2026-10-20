import { applyTools } from "./tools.js";
import { registerFileApi, registerLoginApi, registerOverviewApi } from "./api.js";
export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];
export function apply(ctx) {
    const disposers = [applyTools(ctx), registerOverviewApi(ctx), registerLoginApi(ctx), registerFileApi(ctx)];
    return () => {
        for (const dispose of disposers.reverse())
            dispose?.();
    };
}
//# sourceMappingURL=index.js.map