/**
 * 工作区级禅道绑定配置。每个 DSH 工作区根目录下一个 .dsh-zentao.json，
 * 声明该工作区所属的禅道产品/执行/项目，概览面板据此拉取任务与 Bug：
 * - 任务视图：需要 execution（task 列表必须按执行，CLI 无全局入口）
 * - Bug 视图：product / project / execution 任一（0.3.1 CLI 支持三选一）
 * 本层只读文件与校验，不涉及凭证。
 */
/** 工作区配置文件名（位于工作区根目录）。 */
export declare const WORKSPACE_CONFIG_FILENAME = ".dsh-zentao.json";
export interface WorkspaceConfig {
    /** 产品 ID（Bug 视图优先使用）。 */
    product?: number;
    /** 项目 ID（Bug 视图备选范围）。 */
    project?: number;
    /** 执行 ID（任务视图必需；Bug 视图末选范围）。 */
    execution?: number;
}
export type ReadResult = {
    ok: true;
    config: WorkspaceConfig | null;
} | {
    ok: false;
    error: string;
};
/** 解析配置文件内容；非法 JSON 或字段类型不对时返回错误信息。 */
export declare function parseWorkspaceConfig(raw: string): {
    config: WorkspaceConfig | null;
    error?: string;
};
/** Bug 视图的范围参数：product > project > execution 优先（0.3.1 CLI 三选一）。 */
export declare function bugScopeOf(config: WorkspaceConfig): {
    flag: "--product" | "--project" | "--execution";
    value: number;
} | null;
/**
 * 读取工作区配置。文件不存在返回 { config: null }（未配置是正常态，
 * 面板显示引导而非报错）；读失败/解析失败返回错误。
 */
export declare function readWorkspaceConfig(workspacePath: string): Promise<ReadResult>;
//# sourceMappingURL=workspace-config.d.ts.map