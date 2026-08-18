/**
 * zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
 * 管理（~/.config/zentao/zentao.json），本层不读取、不接触任何凭证。
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { localConfigPath, pluginRoot } from "./config.ts";

/** CLI 返回的结构化错误（code 来自 CLI 错误码或 ENOENT）。 */
export interface CliError extends Error {
  code: string;
  raw?: string;
}

function cliErrorOf(code: string, message: string, raw?: string): CliError {
  const err = new Error(message) as CliError;
  err.code = code;
  if (raw !== undefined) err.raw = raw;
  return err;
}

/** execFile 回调签名（便于测试注入）。 */
type ExecFn = (
  cmd: string,
  args: string[],
  cb: (error: Error | null, stdout: string) => void,
) => void;

/**
 * 解析随插件安装的 zentao-cli bin（作为运行时依赖引入，无需全局安装）。
 * 解析失败（如本地 dev 未装依赖）时返回 null，回退到 PATH 中的全局 zentao。
 */
function resolveBundledCliBin(): string | null {
  try {
    const pkgJson = createRequire(import.meta.url).resolve("zentao-cli/package.json");
    const bin = join(dirname(pkgJson), "bin", "zentao.js");
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

const defaultExec: ExecFn = (cmd, args, cb) => {
  // 配置固定指向插件目录内的 zentao.json（唯一配置来源；登录也由面板发起、写入该文件）。
  const env = { ...process.env, ZENTAO_CONFIG_FILE: localConfigPath(pluginRoot()) };
  // 优先使用插件依赖中的 zentao-cli，并以当前 node（process.execPath）直接执行
  // bin 脚本——不依赖 PATH 中的全局 zentao / node，消除宿主环境差异；解析不到
  // 才回退到全局命令。
  const bundledBin = resolveBundledCliBin();
  const [runCmd, runArgs]: [string, string[]] = bundledBin
    ? [process.execPath, [bundledBin, ...args]]
    : [cmd, args];
  execFile(runCmd, runArgs, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, env }, (error, stdout) => {
    cb(error, String(stdout));
  });
};

/** 解析 CLI JSON 输出；错误统一映射为 CliError。 */
function parseOutput(stdout: string, cliFailed: boolean): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw cliErrorOf(
      "E5001",
      cliFailed
        ? `zentao CLI 执行失败：${stdout.slice(0, 200)}`
        : `zentao CLI 输出无法解析：${stdout.slice(0, 200)}`,
      stdout,
    );
  }
  const obj = parsed as { status?: unknown; error?: { code?: unknown; message?: unknown }; data?: unknown };
  if (obj?.error !== undefined) {
    const code = String(obj.error.code ?? "E5001");
    const message = String(obj.error.message ?? "zentao 请求失败");
    throw cliErrorOf(code, `zentao: ${message}`);
  }
  if (cliFailed) {
    throw cliErrorOf("E5001", `zentao CLI 退出码非 0：${stdout.slice(0, 200)}`, stdout);
  }
  return obj?.data;
}

/**
 * 执行 zentao CLI。args 不含 --format=json（自动追加）。
 * @returns CLI JSON 输出的 data 字段（列表为数组，详情为对象）。
 */
export async function runZentao(args: string[], exec: ExecFn = defaultExec): Promise<unknown> {
  const fullArgs = [...args, "--format=json"];
  return new Promise((resolve, reject) => {
    exec("zentao", fullArgs, (error, stdout) => {
      if (error !== null) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          reject(cliErrorOf("ENOENT", "未找到 zentao CLI：插件依赖 zentao-cli 缺失且 PATH 中无全局命令，请重新安装插件（或 npm i -g zentao-cli）"));
          return;
        }
        try {
          resolve(parseOutput(stdout, true));
        } catch (parseErr) {
          reject(parseErr);
        }
        return;
      }
      try {
        resolve(parseOutput(stdout, false));
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

/** 将未知错误规范化为 CliError（无 code 时给 E5001）。 */
export function asCliError(error: unknown): CliError {
  if (error instanceof Error && "code" in error) return error as CliError;
  return cliErrorOf("E5001", error instanceof Error ? error.message : String(error));
}
