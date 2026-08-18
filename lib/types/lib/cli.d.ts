/**
 * zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
 * 管理（~/.config/zentao/zentao.json），本层不读取、不接触任何凭证。
 */
/** CLI 返回的结构化错误（code 来自 CLI 错误码或 ENOENT）。 */
export interface CliError extends Error {
    code: string;
    raw?: string;
}
/** execFile 回调签名（便于测试注入）。 */
type ExecFn = (cmd: string, args: string[], cb: (error: Error | null, stdout: string) => void) => void;
/**
 * 执行 zentao CLI。args 不含 --format=json（自动追加）。
 * @returns CLI JSON 输出的 data 字段（列表为数组，详情为对象）。
 */
export declare function runZentao(args: string[], exec?: ExecFn): Promise<unknown>;
/** 将未知错误规范化为 CliError（无 code 时给 E5001）。 */
export declare function asCliError(error: unknown): CliError;
export {};
//# sourceMappingURL=cli.d.ts.map