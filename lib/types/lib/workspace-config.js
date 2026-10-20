/**
 * 工作区级禅道绑定配置。每个 DSH 工作区根目录下一个 .dsh-zentao.json，
 * 声明该工作区所属的禅道产品/执行/项目，概览面板据此拉取任务与 Bug：
 * - 任务视图：需要 execution（task 列表必须按执行，CLI 无全局入口）
 * - Bug 视图：product / project / execution 任一（0.3.1 CLI 支持三选一）
 * 本层只读文件与校验，不涉及凭证。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
/** 工作区配置文件名（位于工作区根目录）。 */
export const WORKSPACE_CONFIG_FILENAME = ".dsh-zentao.json";
/** 解析配置文件内容；非法 JSON 或字段类型不对时返回错误信息。 */
export function parseWorkspaceConfig(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return { config: null, error: "不是合法 JSON" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { config: null, error: "配置必须是 JSON 对象" };
    }
    const obj = parsed;
    const config = {};
    const bad = [];
    for (const key of ["product", "project", "execution"]) {
        const value = obj[key];
        if (value === undefined)
            continue;
        const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
        if (!Number.isInteger(num) || num <= 0) {
            bad.push(key);
            continue;
        }
        config[key] = num;
    }
    if (bad.length > 0) {
        return { config: null, error: `字段 ${bad.join("、")} 必须是正整数` };
    }
    if (config.product === undefined && config.project === undefined && config.execution === undefined) {
        return { config: null, error: "至少需要 product / project / execution 之一" };
    }
    return { config };
}
/** Bug 视图的范围参数：product > project > execution 优先（0.3.1 CLI 三选一）。 */
export function bugScopeOf(config) {
    if (config.product !== undefined)
        return { flag: "--product", value: config.product };
    if (config.project !== undefined)
        return { flag: "--project", value: config.project };
    if (config.execution !== undefined)
        return { flag: "--execution", value: config.execution };
    return null;
}
/**
 * 读取工作区配置。文件不存在返回 { config: null }（未配置是正常态，
 * 面板显示引导而非报错）；读失败/解析失败返回错误。
 */
export async function readWorkspaceConfig(workspacePath) {
    const file = join(workspacePath, WORKSPACE_CONFIG_FILENAME);
    let raw;
    try {
        raw = await readFile(file, "utf8");
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT")
            return { ok: true, config: null };
        if (code === "ENOTDIR" || code === "EACCES") {
            return { ok: false, error: `无法读取 ${WORKSPACE_CONFIG_FILENAME}：${code}` };
        }
        return { ok: false, error: `读取 ${WORKSPACE_CONFIG_FILENAME} 失败：${code ?? "未知错误"}` };
    }
    const { config, error } = parseWorkspaceConfig(raw);
    if (config === null) {
        return { ok: false, error: error ?? "配置无效" };
    }
    return { ok: true, config };
}
//# sourceMappingURL=workspace-config.js.map