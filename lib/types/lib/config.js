/**
 * zentao 配置副本管理。插件安装/加载时把用户已有的 zentao.json
 * （默认 ~/.config/zentao/zentao.json，可由 ZENTAO_CONFIG_FILE 覆盖）
 * 复制到插件安装目录，后续 CLI 调用统一携带 ZENTAO_CONFIG_FILE 指向副本，
 * 使插件自包含、不依赖 ~/.config 全局状态。
 *
 * 凭证仍由 CLI 内部使用：本层只做文件复制，不读取、不解析内容。
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/** 从当前文件向上找 package.json 所在目录（兼容源码/构建两种形态）。 */
export function pluginRoot() {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
        if (existsSync(join(dir, "package.json")))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return dir;
}
/** 插件安装目录内的配置副本路径。 */
export function localConfigPath(root = pluginRoot()) {
    return join(root, "zentao.json");
}
/** 用户已有配置：ZENTAO_CONFIG_FILE 优先，否则 ~/.config/zentao/zentao.json。 */
export function userConfigPath() {
    return process.env.ZENTAO_CONFIG_FILE ?? join(homedir(), ".config", "zentao", "zentao.json");
}
/**
 * 幂等复制：用户配置存在且（副本缺失或用户配置更新）时复制到插件目录。
 * @returns 副本路径（可用则返回，否则 null）。
 */
export function ensureLocalConfig(root = pluginRoot()) {
    const src = userConfigPath();
    const dst = localConfigPath(root);
    try {
        if (!existsSync(src))
            return null;
        const srcMtime = statSync(src).mtimeMs;
        if (!existsSync(dst) || statSync(dst).mtimeMs < srcMtime) {
            mkdirSync(dirname(dst), { recursive: true });
            copyFileSync(src, dst);
        }
        return dst;
    }
    catch {
        // 复制失败（无权限/IO 错误）不阻塞插件：调用层回退到 CLI 默认配置。
        return null;
    }
}
//# sourceMappingURL=config.js.map