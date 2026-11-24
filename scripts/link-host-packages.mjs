/**
 * 开发环境宿主包软链脚本（link 安装插件后 DSH 运行时必需）。
 *
 * 背景：本插件以 link: 方式装进 dsh profile 时，lib/index.js 的真实路径在
 * 本工作区，其运行时 import @deepseek-ai/dsh-tools（tsdown 保持 external，
 * 由宿主提供）会从本工作区 node_modules 向上解析。这些包不在 npm 依赖中
 * （typecheck 走 tsconfig paths、vitest 走 vitest.config.ts alias，均指向
 * 兄弟仓库 ../deepseek-harness），需要手工软链到**正在运行 dsh 的宿主安装
 * 树**，使插件与宿主共享同一份模块实例（单例完整性）。
 *
 * 注意：npm install 会把这些软链当 extraneous 清除——装完依赖后重跑本脚本。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = ["cordis", "dsh-tools", "dsh-system-prompt", "dsh-host-webserver"];

/** 定位宿主 @deepseek-ai 包目录：全局 dsh 安装树的 node_modules/@deepseek-ai。 */
function hostPackagesDir() {
  try {
    const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const dir = join(npmRoot, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai");
    if (existsSync(dir)) return dir;
  } catch { /* fallthrough */ }
  return null;
}

const hostDir = hostPackagesDir();
if (hostDir === null) {
  console.error("未找到全局 dsh 安装（npm root -g 下无 @deepseek-ai/dsh）。请确认 dsh 已全局安装。");
  process.exit(1);
}

const scopeDir = join(root, "node_modules", "@deepseek-ai");
mkdirSync(scopeDir, { recursive: true });

let linked = 0;
for (const name of PACKAGES) {
  const target = join(hostDir, name);
  const link = join(scopeDir, name);
  if (!existsSync(target)) {
    console.warn(`跳过 ${name}：宿主安装中不存在（${target}）`);
    continue;
  }
  // 已存在的条目：若已是指向目标的软链则跳过，否则替换（npm 装出的实体目录一律让位于宿主）
  if (existsSync(link)) {
    try {
      if (readlinkSync(link) === target) {
        linked++;
        continue;
      }
    } catch { /* 非软链 */ }
    rmSync(link, { recursive: true, force: true });
  }
  symlinkSync(target, link, "dir");
  linked++;
}
console.log(`已软链 ${linked}/${PACKAGES.length} 个宿主包 → ${hostDir}`);
console.log("提示：npm install 会清除这些软链，装依赖后请重跑 node scripts/link-host-packages.mjs");
