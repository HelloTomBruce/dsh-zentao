/**
 * zentao 工具的模块/动作白名单与 CLI 参数构造。所有列表统一
 * --recPerPage=200 拉全量（--filter 与分页不兼容的 pitfall 规避），
 * 程序侧再按需过滤。
 */
export type ZentaoModule = "program" | "product" | "project" | "execution" | "story" | "epic" | "requirement" | "bug" | "task" | "testcase" | "testtask" | "productplan" | "build" | "release" | "feedback" | "ticket" | "system" | "user" | "file";
export type ZentaoAction = "list" | "get" | "create" | "update" | "delete" | "activate" | "close" | "resolve" | "start" | "finish" | "change";
interface ModuleInfo {
    /** 中文名（错误提示用）。 */
    readonly label: string;
    /** 列表时必须提供的范围参数名（无则 null）。 */
    readonly scopeFlag: string | null;
    /** scope 可选：提供则过滤，缺省则列表全部（真实 CLI：execution 无 scope 可列表）。 */
    readonly scopeOptional?: boolean;
    /** 允许的动作集合。 */
    readonly actions: ReadonlySet<ZentaoAction>;
}
export declare const MODULE_INFO: Record<ZentaoModule, ModuleInfo>;
export declare const MODULES: readonly ZentaoModule[];
/** 工具入参（运行时 schema 校验后的扁平视图）。 */
export interface ZentaoArgs {
    module: ZentaoModule;
    action: ZentaoAction;
    id?: number;
    product?: number;
    project?: number;
    executionID?: number;
    fields?: Record<string, string | number | boolean>;
}
/**
 * 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
 * 校验失败抛 Error（message 面向模型，含中文提示）。
 */
export declare function buildCliArgs(args: ZentaoArgs): string[];
export {};
//# sourceMappingURL=schema.d.ts.map