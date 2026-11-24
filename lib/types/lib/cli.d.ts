/**
 * zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
 * 管理（配置唯一来源是 $DSH_HOME/zentao.json，经 ZENTAO_CONFIG_FILE 指向，
 * 见 ./config.ts），本层不读取、不接触任何凭证。
 * 适配 zentao-cli ≥ 0.5.0：JSON 信封 {ok, data|error, meta}，错误码无前缀
 * （如 "1006"）。
 */
/** CLI 返回的结构化错误（code 来自 CLI 错误码或 ENOENT）。 */
export interface CliError extends Error {
    code: string;
    raw?: string;
}
/** execFile 回调签名（便于测试注入）。 */
type ExecFn = (cmd: string, args: string[], cb: (error: Error | null, stdout: string) => void) => void;
/** CLI 列表输出的完整性元数据（0.5.0 信封 meta 字段；详情等非列表输出可能没有）。 */
export interface CliMeta {
    returned?: number;
    fetched?: number;
    total?: number;
    hasMore?: boolean;
    truncated?: boolean;
    [key: string]: unknown;
}
/** runZentao 结果：data 为列表/详情载荷，meta 为完整性元数据（可能缺省）。 */
export interface CliResult {
    data: unknown;
    meta?: CliMeta | undefined;
}
/**
 * 执行 zentao CLI。args 不含 --format=json（自动追加）。
 * @returns CLI JSON 输出的 data 与 meta（列表的完整性元数据：total/truncated/hasMore 等）。
 */
export declare function runZentao(args: string[], exec?: ExecFn): Promise<CliResult>;
/**
 * 执行 zentao CLI 但不强制 JSON 解析（用于 login 等成功时输出纯文本、
 * --format=json 不生效的命令）。进程退出码 0 即成功，返回原始输出；失败时
 * 优先从输出中提取 error.code/message（错误 JSON 由 CLI 写到 stderr，已在
 * defaultExec 合并回退）。
 */
export declare function runZentaoLoose(args: string[], exec?: ExecFn): Promise<string>;
/** 将未知错误规范化为 CliError（无 code 时给 E5001）。 */
export declare function asCliError(error: unknown): CliError;
export {};
//# sourceMappingURL=cli.d.ts.map