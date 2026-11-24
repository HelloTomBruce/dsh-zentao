import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * @deepseek-ai/* 宿主包不在 npm 依赖中：typecheck 走 tsconfig paths（指向
 * 兄弟仓库 ../deepseek-harness 源码），测试运行时经这里的 alias 同源解析
 * （各包的 pnpm workspace 依赖从其在兄弟仓库内的局部 node_modules 解析）。
 * 注意：不要用 npm install 往本项目 node_modules 塞这些包——会被当作
 * extraneous 清除；改这里与 tsconfig paths 即可。
 */
export default defineConfig({
  // client 组件测试需要 DOM（DOMPurify 依赖 window）
  environmentMatchGlobs: [["tests/client/**", "jsdom"]],
  resolve: {
    alias: {
      "@deepseek-ai/cordis": r("../deepseek-harness/vendor/cordis/lib/index.js"),
      "@deepseek-ai/dsh-tools": r("../deepseek-harness/packages/core/tools/lib/index.js"),
      "@deepseek-ai/dsh-system-prompt": r("../deepseek-harness/packages/core/system-prompt/lib/index.js"),
      "@deepseek-ai/dsh-host-webserver": r("../deepseek-harness/packages/host/webserver/lib/index.js"),
    },
  },
});
