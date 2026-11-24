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

export type ZentaoModule =
  | "program" | "product" | "project" | "execution"
  | "story" | "epic" | "requirement"
  | "bug" | "task" | "testcase" | "testtask"
  | "productplan" | "build" | "release"
  | "feedback" | "ticket" | "system" | "user" | "file"
  | "knowledge" | "doc" | "weekly" | "relation"
  | "my";

export type ZentaoAction = "list" | "get" | "create" | "update" | "delete" | "activate" | "close" | "resolve" | "start" | "finish" | "change" | "confirm"
  | "read" | "search" | "candidates" | "embeddingsSearch"
  | "mySpaces" | "teamSpaces" | "productSpaces" | "projectSpaces"
  | "myLibs" | "teamLibs" | "productLibs" | "projectLibs"
  | "myDocs" | "teamDocs" | "productDocs" | "projectDocs"
  | "todos" | "tasks" | "bugs" | "stories" | "epics" | "requirements" | "testtasks" | "projects" | "feedbacks" | "tickets" | "testcases" | "meetings" | "issues" | "risks";

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

const set = (...xs: ZentaoAction[]): ReadonlySet<ZentaoAction> => new Set(xs);

export const MODULE_INFO: Record<ZentaoModule, ModuleInfo> = {
  program:     { label: "项目集", scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  product:     { label: "产品",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  project:     { label: "项目",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  // 0.5.0 execution list 无 scope flag；提供 project 时经 --filter 在拉取结果内过滤
  execution:   { label: "执行",   scopeFlags: [], scopeOptional: true, createScope: { project: "--project" }, actions: set("list", "get", "create", "update", "delete") },
  story:       { label: "需求",   scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  epic:        { label: "业务需求", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  requirement: { label: "用户需求", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  // bug list 范围三选一（--product/--project/--execution 为 0.5.0 保留的别名）
  bug:         { label: "Bug",    scopeFlags: ["--product", "--project", "--execution"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm") },
  task:        { label: "任务",   scopeFlags: ["--execution-id"], createScope: { executionID: "--execution-id" }, actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish") },
  testcase:    { label: "测试用例", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
  testtask:    { label: "测试单", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
  productplan: { label: "产品计划", scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
  // build create 要求 --execution-id 与 --product 双 scope
  build:       { label: "版本",   scopeFlags: ["--project"], createScope: { executionID: "--execution-id", product: "--product" }, actions: set("list", "get", "create", "update", "delete") },
  release:     { label: "发布",   scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
  feedback:    { label: "反馈",   scopeFlags: ["--product"], createScope: { product: "--product" }, actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  ticket:      { label: "工单",   scopeFlags: ["--product"], createScope: { product: "--product" }, actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  system:      { label: "应用",   scopeFlags: ["--product"], createScope: { product: "--product-id" }, actions: set("list", "get", "create", "update", "delete") },
  user:        { label: "用户",   scopeFlags: [], actions: set("list", "get", "create", "update", "delete") },
  // file create 为 multipart formdata（不支持 --data JSON），字段转 kebab flag；
  // get 取附件信息；read 下载附件内容（--output 落盘，需服务端 ≥ 23.0）
  file:        { label: "附件",   scopeFlags: [], actions: set("create", "delete", "get", "read") },
  // 0.5.0 新模块：AI 知识库（search 关键词/embeddingsSearch 向量搜索，需服务端 ≥ 22.7）
  knowledge:   { label: "AI 知识库", scopeFlags: [], actions: set("list", "get", "search", "embeddingsSearch") },
  // 文档模块：动作即子命令（myDocs → my-docs），列表需 fields.spaceID/libID（需服务端 ≥ 22.5）
  doc:         { label: "文档",   scopeFlags: [], actions: set("mySpaces", "teamSpaces", "productSpaces", "projectSpaces", "myLibs", "teamLibs", "productLibs", "projectLibs", "myDocs", "teamDocs", "productDocs", "projectDocs", "get") },
  // 项目周报（需服务端 ≥ 22.7）
  weekly:      { label: "项目周报", scopeFlags: ["--project"], createScope: { project: "--project-id" }, actions: set("list", "get", "create", "update", "delete") },
  // 对象关联：list/candidates 的 objectType 是位置参数，objectID 用工具 id 入参（需服务端 ≥ 22.7）
  relation:    { label: "对象关联", scopeFlags: [], actions: set("list", "candidates") },
  // 地盘模块：动作即资源名（zentao my tasks），列表式，无需 id 与范围参数
  my:          { label: "地盘（指派给我的）", scopeFlags: [], actions: set("todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks") },
};

export const MODULES = Object.keys(MODULE_INFO) as readonly ZentaoModule[];

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

/** resolve 隐含必填 4 字段（服务端硬性要求，缺一个报 2003）。 */
const RESOLVE_REQUIRED = ["resolution", "assignedTo", "resolvedBuild", "comment"] as const;

/**
 * 从入参解析首个已提供的范围参数（--execution 与 --execution-id 均读
 * executionID 入参；返回 flag+value 供拼 CLI 参数）。
 */
function scopeValueOf(args: ZentaoArgs, flags: readonly string[]): { flag: string; value: number } | undefined {
  for (const flag of flags) {
    const value =
      flag === "--product" ? args.product
        : flag === "--project" ? args.project
          : flag === "--execution" || flag === "--execution-id" ? args.executionID
            : undefined;
    if (value !== undefined) return { flag, value };
  }
  return undefined;
}

/**
 * camelCase → kebab-case（按词切分）：大写连续段（含尾随 s，如 IDs/URLs）整体
 * 为一个词——objectID → object-id、libIDs → lib-ids、realStarted → real-started、
 * XMLHttp → xml-http。无缩写清单的特判，缩写自然按「连续大写」分组。
 */
function kebab(key: string): string {
  const words = key.match(/[A-Z]{2,}s?(?=[A-Z][a-z]|$)|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [key];
  return words.map((w) => w.toLowerCase()).join("-");
}

/** file 模块专用：fields → kebab-case flag 列表（multipart formdata 不支持 --data）。 */
function flagArgs(fields: FieldMap | undefined): string[] {
  if (fields === undefined) return [];
  return Object.entries(fields).map(([k, v]) => `--${kebab(k)}=${String(v)}`);
}

/** 非 scope 字段经 --data JSON 透传（camelCase 原样保留，CLI 按 schema 校验）。 */
function dataArgs(fields: FieldMap | undefined): string[] {
  if (fields === undefined || Object.keys(fields).length === 0) return [];
  return ["--data", JSON.stringify(fields)];
}

/** 列表查询参数（browseType/filter/search/sort/pick/maxItems/htmlToMarkdown）→ CLI flags。filterOverride 用于合并后的过滤表达式（如 execution 的 project scope）。 */
function queryArgs(args: ZentaoArgs, filterOverride?: string): string[] {
  const filter = filterOverride ?? args.filter;
  const out: string[] = [];
  if (args.browseType !== undefined) out.push(`--browse-type=${args.browseType}`);
  if (filter !== undefined) out.push(`--filter=${filter}`);
  if (args.search !== undefined) out.push(`--search=${args.search}`);
  if (args.searchFields !== undefined) out.push(`--search-fields=${args.searchFields}`);
  if (args.sort !== undefined) out.push(`--sort=${args.sort}`);
  if (args.pick !== undefined) out.push(`--fields=${args.pick}`);
  if (args.maxItems !== undefined) out.push(`--max-items=${args.maxItems}`);
  if (args.htmlToMarkdown === true) out.push("--html-to-markdown");
  return out;
}

/** 是否携带了仅列表可用的查询参数（用于非 list 动作的误用拦截）。 */
function hasQueryArgs(args: ZentaoArgs): boolean {
  return args.browseType !== undefined || args.filter !== undefined || args.search !== undefined
    || args.searchFields !== undefined || args.sort !== undefined || args.pick !== undefined
    || args.maxItems !== undefined || args.htmlToMarkdown !== undefined;
}

/** 列表式动作（查询参数生效）：list、my 全部动作、doc 的非 get 动作、relation 全部动作。 */
function isListLike(module: ZentaoModule, action: ZentaoAction): boolean {
  if (module === "my" || module === "relation") return true;
  if (module === "doc") return action !== "get";
  return action === "list";
}

/**
 * create 参数构造：fields 中的 scope 字段（按模块 createScope 映射表）提为
 * 独立 flag，其余经 --data 透传。模型在 fields 里写 execution 或 executionID
 * 均可（统一归一为 executionID 查表）。
 */
function createArgs(info: ModuleInfo, module: ZentaoModule, fields: FieldMap | undefined): string[] {
  const scopeMap = info.createScope ?? {};
  const scopeArgs: string[] = [];
  const rest: FieldMap = {};
  const unmappedScope: string[] = [];
  for (const [k, v] of Object.entries(fields ?? {})) {
    const flag = scopeMap[k as ScopeField] ?? (k === "execution" ? scopeMap.executionID : undefined);
    if (flag !== undefined) scopeArgs.push(`${flag}=${String(v)}`);
    else {
      // scope 类字段未映射 = 该模块 create 不接受它（混入 --data 会被 CLI 以晦涩
      // 信息拒绝）——插件层直接给出应使用的 scope 字段
      if (k === "product" || k === "project" || k === "executionID" || k === "execution") unmappedScope.push(k);
      rest[k] = v;
    }
  }
  if (unmappedScope.length > 0 && Object.keys(scopeMap).length > 0) {
    throw new Error(
      `${info.label}(${module}) create 的范围字段应为 ${Object.entries(scopeMap).map(([k, f]) => `${k}→${f}`).join("、")}，不支持 ${unmappedScope.join("、")}`,
    );
  }
  return [...scopeArgs, ...dataArgs(rest)];
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
  // 查询参数仅列表式动作生效，防止误写到 get/create 等动作上被静默忽略
  if (!isListLike(module, action) && hasQueryArgs(args)) {
    throw new Error(`browseType/filter/search/searchFields/sort/pick/maxItems/htmlToMarkdown 仅在列表式动作上生效（当前 ${module} ${action}）`);
  }

  // 地盘模块：动作即资源名（zentao my tasks），列表式，无需 id 与范围参数。
  if (module === "my") {
    return [module, action, ...queryArgs(args), "--all"];
  }

  // 文档模块：动作即子命令（myDocs → my-docs）；spaceID/libID 从 fields 提为 flag；
  // doc 列表 API 单页返回（不支持 --all），查询参数（filter/search/pick/maxItems 等）可用
  if (module === "doc") {
    if (action === "get") {
      if (id === undefined) throw new Error(`${info.label}(doc) get 需要 id`);
      return ["doc", "get", String(id)];
    }
    const docArgs = ["doc", kebab(action)];
    if (fields?.spaceID !== undefined) docArgs.push(`--space-id=${fields.spaceID}`);
    if (fields?.libID !== undefined) docArgs.push(`--lib-id=${fields.libID}`);
    docArgs.push(...queryArgs(args));
    return docArgs;
  }

  // AI 知识库：list 需 libID（id 或 fields.libID）；search/embeddingsSearch 经 --data 透传
  // （search: {keywords[], libIDs[]}；embeddingsSearch: {keyword, libIDs[], minSimilarity?, limit?}）
  if (module === "knowledge") {
    if (action === "list") {
      const libID = id ?? fields?.libID;
      if (libID === undefined) throw new Error(`${info.label}(knowledge) list 需要 id（知识库 libID）或 fields.libID`);
      return ["knowledge", "list", String(libID), ...queryArgs(args), "--all"];
    }
    if (action === "get") {
      if (id === undefined) throw new Error(`${info.label}(knowledge) get 需要 id`);
      return ["knowledge", "get", String(id)];
    }
    return ["knowledge", kebab(action), ...dataArgs(fields)];
  }

  // 对象关联：objectType 为位置参数，objectID 用 id 入参；candidates 另需 fields.relatedObjectType。
  // relation list 为单页 API（无 --all）；candidates 支持 --all。
  if (module === "relation") {
    const objectType = fields?.objectType;
    if (objectType === undefined || id === undefined) {
      throw new Error(`${info.label}(relation) ${action} 需要 fields.objectType 与 id（objectID），如 fields={objectType:"bug"} id=123`);
    }
    const rest = { ...fields };
    delete rest.objectType;
    const relArgs = ["relation", action, String(objectType), `--object-id=${id}`];
    if (action === "candidates") {
      const related = rest.relatedObjectType;
      if (related === undefined) throw new Error(`relation candidates 需要 fields.relatedObjectType（候选对象类型，如 task/bug）`);
      relArgs.push(`--related-object-type=${String(related)}`);
      delete rest.relatedObjectType;
    }
    if (Object.keys(rest).length > 0) {
      throw new Error(`relation ${action} 不支持字段：${Object.keys(rest).join("、")}（仅 objectType/relatedObjectType + 查询参数）`);
    }
    relArgs.push(...queryArgs(args));
    if (action === "candidates") relArgs.push("--all");
    return relArgs;
  }

  // 附件下载：file read <id> --output <路径>（默认 .dsh-zentao/attachments/file-<id>，
  // 相对路径基于 dsh 宿主工作目录；需服务端 ≥ 23.0）。saveTo 拒绝绝对路径与 ..
  // 上跳——模型可写参数不应有越出宿主工作目录的文件写入能力
  if (module === "file" && action === "read") {
    if (id === undefined) throw new Error(`${info.label}(file) read 需要 id（附件 ID）`);
    const saveTo = fields?.saveTo !== undefined ? String(fields.saveTo) : `.dsh-zentao/attachments/file-${id}`;
    if (/^([a-zA-Z]:|\\|\/)/.test(saveTo) || saveTo.split(/[\\/]/).includes("..")) {
      throw new Error(`saveTo 必须是相对路径且不得包含 .. 上跳（默认基于 dsh 宿主工作目录），收到：${saveTo}`);
    }
    return ["file", "read", String(id), "--output", saveTo];
  }

  if (action === "list") {
    const listArgs = [module, "list"];
    let filter = args.filter;
    if (module === "execution") {
      // 0.5.0 execution list 无 scope flag；提供 project 时并入 --filter（与显式 filter 逗号 AND 合并，
      // 避免两个 --filter 被 CLI 按 OR 处理）在拉取结果内过滤
      if (args.project !== undefined) {
        filter = filter === undefined ? `project=${args.project}` : `project=${args.project},${filter}`;
      }
    } else if (info.scopeFlags.length > 0) {
      const provided = scopeValueOf(args, info.scopeFlags);
      if (provided === undefined && info.scopeOptional !== true) {
        throw new Error(`${info.label}(${module}) 列表需要 ${info.scopeFlags.map((f) => f.replace(/^--/, "")).join(" / ")} 参数`);
      }
      if (provided !== undefined) listArgs.push(`${provided.flag}=${provided.value}`);
    }
    listArgs.push(...(filter === args.filter ? queryArgs(args) : queryArgs(args, filter)), "--all");
    return listArgs;
  }

  if (action === "get") {
    if (id === undefined) throw new Error(`${info.label}(${module}) get 需要 id`);
    return [module, "get", String(id)];
  }

  if (action === "create") {
    // file create 为 multipart formdata（不支持 JSON），字段走 kebab flag
    if (module === "file") return [module, "create", ...flagArgs(fields)];
    return [module, "create", ...createArgs(info, module, fields)];
  }

  if (action === "update") {
    if (id === undefined) throw new Error(`${info.label}(${module}) update 需要 id`);
    return [module, "update", String(id), ...dataArgs(fields)];
  }

  if (action === "delete") {
    if (id === undefined) throw new Error(`${info.label}(${module}) delete 需要 id`);
    return [module, "delete", String(id), "--yes"];
  }

  // 状态流转动作（activate/close/resolve/start/finish/change/confirm）：字段经 --data 透传
  if (action === "resolve") {
    if (id === undefined) throw new Error(`${info.label}(${module}) resolve 需要 id`);
    const missing = RESOLVE_REQUIRED.filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`bug resolve 必须提供 ${missing.join("、")}（resolution/assignedTo/resolvedBuild/comment 四项）`);
    }
    return [module, "resolve", String(id), ...dataArgs(fields)];
  }
  if (action === "start" && module === "task") {
    if (id === undefined) throw new Error(`${info.label}(${module}) start 需要 id`);
    const missing = ["realStarted"].filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`task start 必须提供 ${missing.join("、")}（realStarted 实际开始，必填）`);
    }
    return [module, "start", String(id), ...dataArgs(fields)];
  }
  if (action === "finish" && module === "task") {
    if (id === undefined) throw new Error(`${info.label}(${module}) finish 需要 id`);
    const missing = ["currentConsumed", "realStarted", "finishedDate"].filter((k) => fields?.[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`task finish 必须提供 ${missing.join("、")}（currentConsumed/realStarted/finishedDate，必填）`);
    }
    return [module, "finish", String(id), ...dataArgs(fields)];
  }
  if (id === undefined) throw new Error(`${info.label}(${module}) ${action} 需要 id`);
  return [module, action, String(id), ...dataArgs(fields)];
}
