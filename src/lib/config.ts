/**
 * 插件自包含配置路径。插件目录内的 zentao.json 是唯一配置来源：
 * CLI 调用统一携带 ZENTAO_CONFIG_FILE 指向它；登录由侧栏面板发起，
 * CLI 直接把凭证写入该文件。本层只做路径计算，不读取、不解析内容。
 */

import { existsSync } from "node:fs";
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

/** 插件安装目录内的配置文件路径。 */
export function localConfigPath(root: string = pluginRoot()): string {
  return join(root, "zentao.json");
}
