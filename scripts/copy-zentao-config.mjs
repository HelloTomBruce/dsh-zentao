// postinstall：把用户的 zentao.json 复制到插件安装目录，使插件自包含。
// 幂等：仅在用户配置存在且（副本缺失或用户配置更新）时复制；失败不阻塞安装。
import { copyFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = resolve(dirname(dirname(here))); // <root>/scripts → <root>
const src = process.env.ZENTAO_CONFIG_FILE ?? join(homedir(), ".config", "zentao", "zentao.json");
const dst = join(root, "zentao.json");

try {
  if (!existsSync(src)) {
    console.log("[dsh-zentao] 未找到 zentao 配置（%s），跳过复制。请先运行: zentao login", src);
    process.exit(0);
  }
  const srcMtime = statSync(src).mtimeMs;
  if (!existsSync(dst) || statSync(dst).mtimeMs < srcMtime) {
    copyFileSync(src, dst);
    console.log("[dsh-zentao] 已复制 zentao 配置到插件目录: %s", dst);
  } else {
    console.log("[dsh-zentao] 插件目录配置副本已是最新: %s", dst);
  }
} catch (err) {
  console.warn("[dsh-zentao] 复制 zentao 配置失败（不影响插件安装）:", err instanceof Error ? err.message : err);
}
