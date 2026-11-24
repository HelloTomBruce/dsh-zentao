/**
 * 视图 registry（单一事实源）：视图 key、Tab 标签、CLI 模块、面板列裁剪、
 * scope 解析、筛选选项、详情支持——server（api.ts）与 client（panel.tsx）
 * 共用本文件。无任何 node 内置依赖，可安全进入客户端 bundle。
 *
 * 新增视图只需：① 在 VIEWS 注册一行；② PanelTab/OverviewView 自动跟随；
 * ③ 面板 tabs 由 VIEWS 渲染。
 */

/** 工作区绑定（.dsh-zentao.json 解析结果；server/client 共用形状）。 */
export interface WorkspaceBinding {
  product?: number;
  project?: number;
  execution?: number;
  /** 可选执行列表（多执行绑定，任务视图切换下拉）。 */
  executions?: number[];
}

export type ViewKey = "tasks" | "bugs" | "stories" | "testtasks" | "testcases";

export type NameKey = "name" | "title";

/** 列表筛选选项：browse → --browse-type（服务端状态集）；filter → --filter（拉取范围内条件过滤）。 */
export interface FilterOption {
  key: string;
  label: string;
  browse?: string;
  filter?: string;
}

export interface ViewDef {
  key: ViewKey;
  /** Tab 标签。 */
  label: string;
  /** CLI 模块名。 */
  module: "task" | "bug" | "story" | "testtask" | "testcase";
  /** 行标题字段。 */
  nameKey: NameKey;
  /** --fields 面板列裁剪。 */
  fields: string;
  /** 由绑定生成 scope 参数；null = 该视图缺绑定（返回空 + note）。 */
  scopeArgs: (config: WorkspaceBinding) => string[] | null;
  /** scope 缺失时的提示。 */
  missingNote: (filename: string) => string;
  /** 详情端点是否支持（CLI 无 get 子命令的视图为 false）。 */
  detailSupported: boolean;
  /** 详情正文字段（按顺序渲染描述区块）。 */
  descFields: readonly { field: string; label: string }[];
  /** 状态筛选选项。 */
  filterOptions: readonly FilterOption[];
  /** 严重程度筛选仅对 Bug 有意义。 */
  severityEnabled: boolean;
}

/**
 * 筛选选项已按真实服务端行为校准：
 * - tasks/stories：本部署对这两类 list 的 --browse-type 无效（tasks 静默忽略、
 *   story 不支持），全部状态项走 --filter 表达式
 * - bugs：--browse-type 有效（unclosed 726→88），默认项用它；状态明细项
 *   统一 browse=all + filter（避免与服务端默认状态集相交导致空结果）
 * - testtasks/testcases：本部署 status 值为本地化中文且 browse-type 被忽略，
 *   服务端状态筛选不可靠——只提供全部默认，状态徽标原样显示
 */
export const VIEWS: Record<ViewKey, ViewDef> = {
  tasks: {
    key: "tasks", label: "任务", module: "task", nameKey: "name",
    fields: "id,name,status,pri,deadline,assignedTo,assignedToRealName,openedBy,execution",
    scopeArgs: (c) => (c.execution !== undefined ? [`--execution-id=${c.execution}`] : null),
    missingNote: (f) => `未选择执行——在上方范围选择器中选择，或在 ${f} 中配置 execution`,
    detailSupported: true,
    descFields: [{ field: "desc", label: "任务描述" }],
    filterOptions: [
      { key: "unclosed", label: "未关闭", filter: "status!=closed" },
      { key: "wait", label: "未开始", filter: "status=wait" },
      { key: "doing", label: "进行中", filter: "status=doing" },
      { key: "done", label: "已完成", filter: "status=done" },
      { key: "all", label: "全部" },
    ],
    severityEnabled: false,
  },
  bugs: {
    key: "bugs", label: "Bug", module: "bug", nameKey: "title",
    fields: "id,title,status,pri,severity,deadline,assignedTo,assignedToRealName,openedBy",
    scopeArgs: (c) => {
      if (c.product !== undefined) return [`--product=${c.product}`];
      if (c.project !== undefined) return [`--project=${c.project}`];
      if (c.execution !== undefined) return [`--execution=${c.execution}`];
      return null;
    },
    missingNote: (f) => `未选择范围——在上方选择产品 / 项目 / 执行，或在 ${f} 中配置 product / project / execution`,
    detailSupported: true,
    descFields: [{ field: "steps", label: "重现步骤" }],
    filterOptions: [
      { key: "unclosed", label: "未关闭", browse: "unclosed" },
      { key: "active", label: "激活", browse: "all", filter: "status=active" },
      { key: "resolved", label: "已解决", browse: "all", filter: "status=resolved" },
      { key: "closed", label: "已关闭", browse: "all", filter: "status=closed" },
      { key: "all", label: "全部", browse: "all" },
    ],
    severityEnabled: true,
  },
  stories: {
    key: "stories", label: "需求", module: "story", nameKey: "title",
    fields: "id,title,status,pri,stage,plan,assignedTo,assignedToRealName,openedBy",
    scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
    missingNote: (f) => `未选择产品——在上方范围选择器中选择，或在 ${f} 中配置 product`,
    detailSupported: true,
    descFields: [
      { field: "spec", label: "需求描述" },
      { field: "verify", label: "验收标准" },
    ],
    filterOptions: [
      { key: "unclosed", label: "未关闭", filter: "status!=closed" },
      { key: "active", label: "激活", filter: "status=active" },
      { key: "reviewing", label: "评审中", filter: "status=reviewing" },
      { key: "closed", label: "已关闭", filter: "status=closed" },
      { key: "all", label: "全部" },
    ],
    severityEnabled: false,
  },
  testtasks: {
    key: "testtasks", label: "测试单", module: "testtask", nameKey: "name",
    fields: "id,name,status,pri,owner,build,begin,end",
    scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
    missingNote: (f) => `未选择产品——在上方范围选择器中选择，或在 ${f} 中配置 product`,
    detailSupported: false, // CLI 无 testtask get 子命令
    descFields: [],
    filterOptions: [{ key: "all", label: "全部" }],
    severityEnabled: false,
  },
  testcases: {
    key: "testcases", label: "用例", module: "testcase", nameKey: "title",
    fields: "id,title,status,pri,type,stage,lastRunResult,openedBy",
    scopeArgs: (c) => (c.product !== undefined ? [`--product=${c.product}`] : null),
    missingNote: (f) => `未选择产品——在上方范围选择器中选择，或在 ${f} 中配置 product`,
    detailSupported: true,
    descFields: [
      { field: "precondition", label: "前置条件" },
      { field: "steps", label: "测试步骤" },
    ],
    filterOptions: [{ key: "all", label: "全部" }],
    severityEnabled: false,
  },
};

export const VIEW_KEYS: readonly ViewKey[] = Object.keys(VIEWS) as readonly ViewKey[];

/** 平铺的筛选选项记录（per-view filterOptions 的索引视图）。 */
export const FILTER_OPTIONS: Record<ViewKey, readonly FilterOption[]> = Object.fromEntries(
  VIEW_KEYS.map((k) => [k, VIEWS[k].filterOptions]),
) as Record<ViewKey, readonly FilterOption[]>;

export function isViewKey(v: string): v is ViewKey {
  return (VIEW_KEYS as readonly string[]).includes(v);
}

/** 默认筛选选项 key（各视图首项）。 */
export const DEFAULT_FILTER_KEY: Record<ViewKey, string> = Object.fromEntries(
  VIEW_KEYS.map((k) => [k, VIEWS[k].filterOptions[0]?.key ?? "all"]),
) as Record<ViewKey, string>;

/** 需求阶段（stage）中文映射：独立于 status 的生命周期维度。 */
export const STORY_STAGE_MAP: Record<string, string> = {
  planned: "已计划",
  projected: "已立项",
  developing: "开发中",
  developed: "开发完成",
  testing: "测试中",
  verified: "已验收",
  released: "已发布",
};

/** 用例类型（type）中文映射。 */
export const CASE_TYPE_MAP: Record<string, string> = {
  feature: "功能",
  performance: "性能",
  configuration: "配置",
  install: "安装部署",
  security: "安全",
  interface: "接口",
  unit: "单元",
  workflow: "流程",
  others: "其他",
};

/** 优先级选项（tasks/bugs/... 通用；空 key = 不筛选）。 */
export const PRI_OPTIONS: readonly { key: string; label: string }[] = [
  { key: "", label: "全部优先级" },
  { key: "1", label: "P1" },
  { key: "2", label: "P2" },
  { key: "3", label: "P3" },
  { key: "4", label: "P4" },
];

/** 严重程度选项（仅 Bug 视图；空 key = 不筛选）。 */
export const SEVERITY_OPTIONS: readonly { key: string; label: string }[] = [
  { key: "", label: "全部级别" },
  { key: "1", label: "致命" },
  { key: "2", label: "严重" },
  { key: "3", label: "一般" },
  { key: "4", label: "轻微" },
];
