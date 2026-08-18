/**
 * zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
 * 管理（~/.config/zentao/zentao.json），本层不读取、不接触任何凭证。
 */

import { execFile } from "node:child_process";

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

const defaultExec: ExecFn = (cmd, args, cb) => {
  execFile(cmd, args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
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
          reject(cliErrorOf("ENOENT", "未找到 zentao CLI，请先安装：npm i -g zentao-cli"));
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
