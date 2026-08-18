import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type JsonValue } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-system-prompt";
import { runZentao } from "./lib/cli.ts";
import { buildCliArgs, MODULES, type ZentaoArgs } from "./schema.ts";

const DESCRIPTION = `Query or operate ZenTao (禅道) project data through the installed \`zentao\` CLI.

Usage: pick a \`module\` (story/bug/task/project/execution/product/...) and an \`action\`:
- list: fetch rows (pass the module's scope param, e.g. bug -> product, release -> productID, task -> executionID)
- get <id>: fetch one object
- create: pass \`fields\` (e.g. title, assignedTo, pri)
- update <id>: pass changed \`fields\` only (CLI backfills the rest)
- delete <id>
- status actions per module: bug -> activate/close/resolve; task -> activate/close/start/finish; story -> activate/close/change

Scope flags by module family:
- \`--product\`: story / bug / testcase
- \`--productID\`: epic / requirement / testtask / productplan / release / feedback / ticket / system
- \`--project\`: execution / build
- \`--executionID\`: task (note: not \`execution\`)

Notes:
- bug resolve requires resolution + assignedTo + resolvedBuild + comment (server-enforced).
- Lists return full data (up to 200 rows) — filter client-side via the \`status\` / \`assignedTo\` fields in the JSON.
- zentao-cli ships as a plugin runtime dependency (no global install needed); login must be done once beforehand (zentao login, credentials managed by the CLI)`;

export const ZENTAO_PARAMETERS = {
  module: {
    type: "string",
    required: true,
    enum: MODULES,
    description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file",
  },
  action: {
    type: "string",
    required: true,
    enum: ["list", "get", "create", "update", "delete", "activate", "close", "resolve", "start", "finish", "change"],
    description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/start/finish/change，按模块校验）",
  },
  id: {
    type: "number",
    description: "对象 ID（get/update/delete/状态动作需要）。",
  },
  product: {
    type: "number",
    description: "产品 ID（列表范围参数）。story/bug/testcase 用 --product，epic/requirement/release/feedback/ticket 等用 --productID，插件自动映射。",
  },
  project: {
    type: "number",
    description: "项目 ID（列表范围参数，execution/build 需要）。",
  },
  executionID: {
    type: "number",
    description: "执行 ID（task 列表的范围参数，注意是 executionID 不是 execution）。",
  },
  fields: {
    type: "object",
    description: "字段键值对（create/update/状态动作），如 { title, assignedTo, pri, severity, status }。",
    additionalProperties: true,
  },
} as const;

export function applyTools(ctx: Context): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(ctx.systemPrompt.section({
    name: "tool:zentao",
    order: 130,
    text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish). For lists pass the module's scope param (story/bug/testcase -> product; epic/requirement/release/feedback/ticket -> productID; task -> executionID; execution/build -> project); results come back as JSON arrays (200-row cap) — filter client-side. bug resolve needs resolution + assignedTo + resolvedBuild + comment. Requires zentao CLI installed and logged in.",
  }));

  disposers.push(ctx.tools.register(
    defineTool({
      name: "zentao",
      description: DESCRIPTION,
      parameters: ZENTAO_PARAMETERS,
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            module: { type: "string", required: true },
            action: { type: "string", required: true },
            data: { type: "json", required: true },
            count: { type: "number" },
          },
        },
        render: (_args, value) => [
          {
            type: "text" as const,
            text: `zentao ${value.module} ${value.action}：${value.count ?? "—"} 条。数据见卡片。`,
          },
        ],
        presentationMeta: (_args, value) => ({
          module: value.module,
          action: value.action,
          // 完整数据：meta 是仅供 UI bridge 的 presentation payload（不进模型上下文），
          // 客户端表格卡从 block.meta 重建列与行。
          data: value.data,
          count: value.count ?? 0,
        }),
      },
      isConcurrencySafe: () => false,
      async execute(args) {
        const zargs = args as ZentaoArgs;
        const data = (await runZentao(buildCliArgs(zargs))) as JsonValue;
        const count = Array.isArray(data) ? data.length : data === undefined ? 0 : 1;
        return { module: zargs.module, action: zargs.action, data, count };
      },
      presentCall: (args) => ({
        card: "generic" as const,
        title: `zentao ${args.module} ${args.action}${args.id !== undefined ? ` #${args.id}` : ""}`,
        kind: "other",
        rawInput: args,
      }),
      presentResult: (args, result) =>
        result.isError
          ? undefined
          : { card: "generic" as const, title: `zentao ${args.module} ${args.action}` },
    }),
  ));

  return () => {
    for (const dispose of disposers) dispose?.();
  };
}
