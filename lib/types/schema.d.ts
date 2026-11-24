/**
 * zentao 工具的模块/动作白名单与 CLI 参数构造（适配 zentao-cli ≥ 0.5.0：
 * - 列表/详情必须显式子命令：`bug list` / `bug get <id>`（0.3.x 的默认动作已移除）
 * - `--recPerPage=200` 已移除，列表统一 `--all` 显式遍历全部页面
 * - task 列表 scope 为 `--execution-id`（kebab-case）
 * - 写操作字段经 `--data <json>` 透传（camelCase 字段名原样保留，CLI 按
 *   schema 校验类型）；scope 字段（product/executionID…）不是请求体字段，
 *   create 时按模块映射为 `--product-id` / `--execution-id` 等独立 flag
 * - file create 走 multipart formdata 不支持 JSON，字段转 kebab-case flag
 */
export type ZentaoModule = "program" | "product" | "project" | "execution" | "story" | "epic" | "requirement" | "bug" | "task" | "testcase" | "testtask" | "productplan" | "build" | "release" | "feedback" | "ticket" | "system" | "user" | "file" | "my";
export type ZentaoAction = "list" | "get" | "create" | "update" | "delete" | "activate" | "close" | "resolve" | "start" | "finish" | "change" | "confirm" | "todos" | "tasks" | "bugs" | "stories" | "epics" | "requirements" | "testtasks" | "projects" | "feedbacks" | "tickets" | "testcases" | "meetings" | "issues" | "risks";
/** fields 中可作为 create scope 的键（execution 视作 executionID 的别名）。 */
type ScopeField = "product" | "project" | "executionID";
interface ModuleInfo {
    /** 中文名（错误提示用）。 */
    readonly label: string;
    /** 列表时可用的范围参数名集合（空数组 = 无需范围参数）。 */
    readonly scopeFlags: readonly string[];
    /** scope 可选：提供则过滤，缺省则列表全部（如 execution 无 scope 可列表）。 */
    readonly scopeOptional?: boolean;
    /**
     * create 时 scope 字段 → CLI flag 的映射（0.5.0 起 scope 不是请求体字段，
     * 混在 --data 里会被拒绝，必须按模块映射为独立 flag，名字各模块异构：
     * bug/story 是 --product-id，feedback/ticket 是 --product）。
     */
    readonly createScope?: Readonly<Partial<Record<ScopeField, string>>>;
    /** 允许的动作集合。 */
    readonly actions: ReadonlySet<ZentaoAction>;
}
export declare const MODULE_INFO: Record<ZentaoModule, ModuleInfo>;
export declare const MODULES: readonly ZentaoModule[];
/** 字段值：标量或数组（如 bug create 的 openedBuild 须为数组 ["trunk"]，CLI 按 schema 强校验）。 */
export type FieldValue = string | number | boolean | Array<string | number>;
export type FieldMap = Record<string, FieldValue>;
/** 工具入参（运行时 schema 校验后的扁平视图）。 */
export interface ZentaoArgs {
    module: ZentaoModule;
    action: ZentaoAction;
    id?: number;
    product?: number;
    project?: number;
    executionID?: number;
    fields?: FieldMap;
    /** 列表状态过滤（--browse-type，取值随模块，如 task 的 unclosed）。仅 list/地盘动作生效。 */
    browseType?: string;
    /** 条件过滤表达式（--filter，拉取范围内，逗号分隔为 AND），如 status=active。仅 list/地盘动作生效。 */
    filter?: string;
    /** 关键词搜索（--search，拉取范围内）。仅 list/地盘动作生效。 */
    search?: string;
    /** 限定 search 的字段（--search-fields，逗号分隔）。仅 list/地盘动作生效。 */
    searchFields?: string;
    /** 排序（--sort），如 id:desc / pri:asc。仅 list/地盘动作生效。 */
    sort?: string;
    /** 返回字段裁剪（--fields，逗号分隔）——大列表先裁剪再进上下文，省 token。仅 list/地盘动作生效。 */
    pick?: string;
    /** 最多返回条数（--max-items）；缺省 --all 拉全量，给定时结果带 truncated 截断标记。仅 list/地盘动作生效。 */
    maxItems?: number;
    /** 富文本字段转 Markdown（--html-to-markdown）。仅 list/地盘动作生效。 */
    htmlToMarkdown?: boolean;
}
/**
 * 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
 * 校验失败抛 Error（message 面向模型，含中文提示）。
 */
export declare function buildCliArgs(args: ZentaoArgs): string[];
export {};
//# sourceMappingURL=schema.d.ts.map