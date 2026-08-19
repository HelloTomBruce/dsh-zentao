/**
 * 插件自包含配置路径。配置唯一来源是 dsh 用户目录下的 zentao.json
 * （$DSH_HOME/zentao.json，默认 ~/.dsh/zentao.json）：CLI 调用统一携带
 * ZENTAO_CONFIG_FILE 指向它；登录由侧栏面板发起，CLI 直接把凭证写入该文件。
 * 本层只做路径计算与旧位置迁移，不读取、不解析凭证内容。
 *
 * 历史：早期版本配置放在插件安装目录（node_modules/dsh-zentao/zentao.json），
 * 但 node_modules 会被 pnpm 更新/重装整体重建，登录态随之丢失（表现为"重启
 * 后要重新登录"）；dsh 用户目录与 dsh 自身的 profiles/设置同级，重装插件
 * 不影响，且跨 profile 共享登录态。
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 从当前文件向上找 package.json 所在目录（兼容源码/构建两种形态）。 */
export function pluginRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/** dsh 用户目录（与 @deepseek-ai/dsh-home-paths 的 resolveDshHome 对齐）。 */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

/**
 * 配置文件路径：dsh 用户目录下的 zentao.json（稳定位置，不随插件重装丢失）。
 * root 为旧版配置所在的插件目录：旧文件存在且新位置缺失时自动迁移一次；
 * 迁移失败不阻塞（CLI 按未登录处理，面板重新登录即可）。
 */
export function localConfigPath(root: string = pluginRoot()): string {
  const stable = join(dshHome(), "zentao.json");
  if (!existsSync(stable)) {
    const legacy = join(root, "zentao.json");
    if (existsSync(legacy)) {
      try {
        mkdirSync(dirname(stable), { recursive: true });
        copyFileSync(legacy, stable);
      } catch { /* 见上 */ }
    }
  }
  return stable;
}
