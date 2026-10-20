/**
 * zentao 工具的模块/动作白名单与 CLI 参数构造（适配 zentao-cli ≥ 0.3.1：
 * bug 列表范围三选一、新增 my 地盘模块与 bug confirm 动作）。
 * 所有列表统一 --recPerPage=200 拉全量（--filter 与分页不兼容的 pitfall
 * 规避），程序侧再按需过滤。
 */

export type ZentaoModule =
  | "program" | "product" | "project" | "execution"
  | "story" | "epic" | "requirement"
  | "bug" | "task" | "testcase" | "testtask"
  | "productplan" | "build" | "release"
  | "feedback" | "ticket" | "system" | "user" | "file"
  | "my";

export type ZentaoAction = "list" | "get" | "create" | "update" | "delete" | "activate" | "close" | "resolve" | "start" | "finish" | "change" | "confirm"
  | "todos" | "tasks" | "bugs" | "stories" | "epics" | "requirements" | "testtasks" | "projects" | "feedbacks" | "tickets" | "testcases" | "meetings" | "issues" | "risks";

interface ModuleInfo {
  /** 中文名（错误提示用）。 */
  readonly label: string;
  /** 列表时可用的范围参数名集合（空数组 = 无需范围参数）。 */
  readonly scopeFlags: readonly string[];
  /** scope 可选：提供则过滤，缺省则列表全部（真实 CLI：execution 无 scope 可列表）。 */
  readonly scopeOptional?: boolean;
  /** 允许的动作集合。 */
  readonly actions: ReadonlySet<ZentaoAction>;
}

const set = (...xs: ZentaoAction[]): ReadonlySet<ZentaoAction> => new Set(xs);

export const MODULE_INFO: Record<ZentaoModule, ModuleInfo> = {
  program:     { label: "项目集", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  product:     { label: "产品",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  project:     { label: "项目",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  execution:   { label: "执行",   scopeFlags: ["--project"], scopeOptional: true, actions: set("list", "get", "create", "update", "delete") },
  story:       { label: "需求",   scopeFlags: ["--product"], actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  epic:        { label: "业务需求", scopeFlags: ["--productID"], actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  requirement: { label: "用户需求", scopeFlags: ["--productID"], actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  // 0.3.1 CLI：Bug 列表支持 --product / --project / --execution 三选一；confirm 为新增动作
  bug:         { label: "Bug",    scopeFlags: ["--product", "--project", "--execution"], actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm") },
  task:        { label: "任务",   scopeFlags: ["--executionID"], actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish") },
  testcase:    { label: "测试用例", scopeFlags: ["--product"], actions: set("list", "get", "create", "update", "delete") },
  testtask:    { label: "测试单", scopeFlags: ["--productID"], actions: set("create", "update", "delete") },
  productplan: { label: "产品计划", scopeFlags: ["--productID"], actions: set("create", "update", "delete") },
  build:       { label: "版本",   scopeFlags: ["--project"], actions: set("create", "update", "delete") },
  release:     { label: "发布",   scopeFlags: ["--productID"], actions: set("create", "update", "delete") },
  feedback:    { label: "反馈",   scopeFlags: ["--productID"], actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  ticket:      { label: "工单",   scopeFlags: ["--productID"], actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  system:      { label: "应用",   scopeFlags: ["--productID"], actions: set("list", "create", "update") },
  user:        { label: "用户",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  file:        { label: "附件",   scopeFlags: [], actions: set("create", "delete") },
  // 0.3.1 CLI 地盘模块：动作即资源名（指派给我的任务/Bug 等），列表无需范围参数
  my:          { label: "地盘（指派给我的）", scopeFlags: [], actions: set("todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks") },
};

export const MODULES = Object.keys(MODULE_INFO) as readonly ZentaoModule[];

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

/** resolve 隐含必填 4 字段（服务端硬性要求，缺一个报 E2008）。 */
const RESOLVE_REQUIRED = ["resolution", "assignedTo", "resolvedBuild", "comment"] as const;

/**
 * 从入参解析首个已提供的范围参数（--execution 与 --executionID 均读
 * executionID 入参；返回 flag+value 供拼 CLI 参数）。
 */
function scopeValueOf(args: ZentaoArgs, flags: readonly string[]): { flag: string; value: number } | undefined {
  for (const flag of flags) {
    const value =
      flag === "--product" || flag === "--productID" ? args.product
        : flag === "--project" ? args.project
          : flag === "--execution" || flag === "--executionID" ? args.executionID
            : undefined;
    if (value !== undefined) return { flag, value };
  }
  return undefined;
}

/**
 * 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
 * 校验失败抛 Error（message 面向模型，含中文提示）。
 */
export function buildCliArgs(args: ZentaoArgs): string[] {
  const info = MODULE_INFO[args.module];
  if (info === undefined) {
    throw new Error(`未知模块 ${String(args.module)}，可选：${MODULES.join("/")}`);
  }
  const { module, action, id, fields } = args;
  if (!info.actions.has(action)) {
    throw new Error(`${info.label}(${module}) 不支持动作 ${action}，可选：${[...info.actions].join("/")}`);
  }

  // 地盘模块：动作即资源名（zentao my tasks），列表式，无需 id 与范围参数。
  if (module === "my") {
    return [module, action, "--recPerPage=200"];
  }

  if (action === "list") {
    const scopes = info.scopeFlags;
    if (scopes.length > 0) {
      const provided = scopeValueOf(args, scopes);
      if (provided === undefined && info.scopeOptional !== true) {
        throw new Error(`${info.label}(${module}) 列表需要 ${scopes.map((f) => f.replace(/^--/, "")).join(" / ")} 参数`);
      }
      return provided === undefined
        ? [module, "--recPerPage=200"]
        : [module, `${provided.flag}=${provided.value}`, "--recPerPage=200"];
    }
    return [module, "--recPerPage=200"];
  }

  if (action === "get") {
    if (id === undefined) throw new Error(`${info.label}(${module}) get 需要 id`);
    return [module, String(id)];
  }

  if (action === "create") {
    return [module, "create", ...flagArgs(fields)];
  }

  if (action === "update") {
    if (id === undefined) throw new Error(`${info.label}(${module}) update 需要 id`);
    return [module, "update", String(id), ...flagArgs(fields)];
  }

  if (action === "delete") {
    if (id === undefined) throw new Error(`${info.label}(${module}) delete 需要 id`);
    return [module, "delete", String(id), "--yes"];
  }

  // 状态流转动作（activate/close/resolve/start/finish/change）
  if (action === "resolve") {
    if (id === undefined) throw new Error(`${info.label}(${module}) resolve 需要 id`);
    const missing = RESOLVE_REQUIRED.filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`bug resolve 必须提供 ${missing.join("、")}（resolution/assignedTo/resolvedBuild/comment 四项）`);
    }
    return [module, "resolve", String(id), ...flagArgs(fields)];
  }
  if (action === "start" && module === "task") {
    if (id === undefined) throw new Error(`${info.label}(${module}) start 需要 id`);
    const missing = ["realStarted"].filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`task start 必须提供 ${missing.join("、")}（realStarted 实际开始，必填）`);
    }
    return [module, "start", String(id), ...flagArgs(fields)];
  }
  if (action === "finish" && module === "task") {
    if (id === undefined) throw new Error(`${info.label}(${module}) finish 需要 id`);
    const missing = ["currentConsumed", "realStarted", "finishedDate"].filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`task finish 必须提供 ${missing.join("、")}（currentConsumed/realStarted/finishedDate，必填）`);
    }
    return [module, "finish", String(id), ...flagArgs(fields)];
  }
  if (id === undefined) throw new Error(`${info.label}(${module}) ${action} 需要 id`);
  return [module, action, String(id), ...flagArgs(fields)];
}

function flagArgs(fields: Record<string, string | number | boolean> | undefined): string[] {
  if (fields === undefined) return [];
  return Object.entries(fields).map(([k, v]) => `--${k}=${String(v)}`);
}
