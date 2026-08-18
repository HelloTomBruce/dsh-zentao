import { createRequire } from "node:module";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
//#region lib/types/lib/config.js
/**
* zentao 配置副本管理。插件安装/加载时把用户已有的 zentao.json
* （默认 ~/.config/zentao/zentao.json，可由 ZENTAO_CONFIG_FILE 覆盖）
* 复制到插件安装目录，后续 CLI 调用统一携带 ZENTAO_CONFIG_FILE 指向副本，
* 使插件自包含、不依赖 ~/.config 全局状态。
*
* 凭证仍由 CLI 内部使用：本层只做文件复制，不读取、不解析内容。
*/
/** 从当前文件向上找 package.json 所在目录（兼容源码/构建两种形态）。 */
function pluginRoot() {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 6; i++) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dir;
}
/** 插件安装目录内的配置副本路径。 */
function localConfigPath(root = pluginRoot()) {
	return join(root, "zentao.json");
}
/** 用户已有配置：ZENTAO_CONFIG_FILE 优先，否则 ~/.config/zentao/zentao.json。 */
function userConfigPath() {
	return process.env.ZENTAO_CONFIG_FILE ?? join(homedir(), ".config", "zentao", "zentao.json");
}
/**
* 幂等复制：用户配置存在且（副本缺失或用户配置更新）时复制到插件目录。
* @returns 副本路径（可用则返回，否则 null）。
*/
function ensureLocalConfig(root = pluginRoot()) {
	const src = userConfigPath();
	const dst = localConfigPath(root);
	try {
		if (!existsSync(src)) return null;
		const srcMtime = statSync(src).mtimeMs;
		if (!existsSync(dst) || statSync(dst).mtimeMs < srcMtime) {
			mkdirSync(dirname(dst), { recursive: true });
			copyFileSync(src, dst);
		}
		return dst;
	} catch {
		return null;
	}
}
//#endregion
//#region lib/types/lib/cli.js
/**
* zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
* 管理（~/.config/zentao/zentao.json），本层不读取、不接触任何凭证。
*/
function cliErrorOf(code, message, raw) {
	const err = new Error(message);
	err.code = code;
	if (raw !== void 0) err.raw = raw;
	return err;
}
/**
* 解析随插件安装的 zentao-cli bin（作为运行时依赖引入，无需全局安装）。
* 解析失败（如本地 dev 未装依赖）时返回 null，回退到 PATH 中的全局 zentao。
*/
function resolveBundledCliBin() {
	try {
		const pkgJson = createRequire(import.meta.url).resolve("zentao-cli/package.json");
		const bin = join(dirname(pkgJson), "bin", "zentao.js");
		return existsSync(bin) ? bin : null;
	} catch {
		return null;
	}
}
const defaultExec = (cmd, args, cb) => {
	const config = localConfigPath(pluginRoot());
	const env = { ...process.env };
	if (existsSync(config)) env.ZENTAO_CONFIG_FILE = config;
	const bundledBin = resolveBundledCliBin();
	const [runCmd, runArgs] = bundledBin ? [process.execPath, [bundledBin, ...args]] : [cmd, args];
	execFile(runCmd, runArgs, {
		timeout: 3e4,
		maxBuffer: 8388608,
		env
	}, (error, stdout) => {
		cb(error, String(stdout));
	});
};
/** 解析 CLI JSON 输出；错误统一映射为 CliError。 */
function parseOutput(stdout, cliFailed) {
	let parsed;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw cliErrorOf("E5001", cliFailed ? `zentao CLI 执行失败：${stdout.slice(0, 200)}` : `zentao CLI 输出无法解析：${stdout.slice(0, 200)}`, stdout);
	}
	const obj = parsed;
	if (obj?.error !== void 0) throw cliErrorOf(String(obj.error.code ?? "E5001"), `zentao: ${String(obj.error.message ?? "zentao 请求失败")}`);
	if (cliFailed) throw cliErrorOf("E5001", `zentao CLI 退出码非 0：${stdout.slice(0, 200)}`, stdout);
	return obj?.data;
}
/**
* 执行 zentao CLI。args 不含 --format=json（自动追加）。
* @returns CLI JSON 输出的 data 字段（列表为数组，详情为对象）。
*/
async function runZentao(args, exec = defaultExec) {
	const fullArgs = [...args, "--format=json"];
	return new Promise((resolve, reject) => {
		exec("zentao", fullArgs, (error, stdout) => {
			if (error !== null) {
				if (error.code === "ENOENT") {
					reject(cliErrorOf("ENOENT", "未找到 zentao CLI：插件依赖 zentao-cli 缺失且 PATH 中无全局命令，请重新安装插件（或 npm i -g zentao-cli）"));
					return;
				}
				try {
					resolve(parseOutput(stdout, true));
				} catch (parseErr) {
					reject(parseErr);
				}
				return;
			}
			try {
				resolve(parseOutput(stdout, false));
			} catch (parseErr) {
				reject(parseErr);
			}
		});
	});
}
/** 将未知错误规范化为 CliError（无 code 时给 E5001）。 */
function asCliError(error) {
	if (error instanceof Error && "code" in error) return error;
	return cliErrorOf("E5001", error instanceof Error ? error.message : String(error));
}
//#endregion
//#region lib/types/schema.js
/**
* zentao 工具的模块/动作白名单与 CLI 参数构造。所有列表统一
* --recPerPage=200 拉全量（--filter 与分页不兼容的 pitfall 规避），
* 程序侧再按需过滤。
*/
const set = (...xs) => new Set(xs);
const MODULE_INFO = {
	program: {
		label: "项目集",
		scopeFlag: null,
		actions: set("list", "get", "create", "update", "delete")
	},
	product: {
		label: "产品",
		scopeFlag: null,
		actions: set("list", "get", "create", "update", "delete")
	},
	project: {
		label: "项目",
		scopeFlag: null,
		actions: set("list", "get", "create", "update", "delete")
	},
	execution: {
		label: "执行",
		scopeFlag: "--project",
		scopeOptional: true,
		actions: set("list", "get", "create", "update", "delete")
	},
	story: {
		label: "需求",
		scopeFlag: "--product",
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	epic: {
		label: "业务需求",
		scopeFlag: "--productID",
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	requirement: {
		label: "用户需求",
		scopeFlag: "--productID",
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	bug: {
		label: "Bug",
		scopeFlag: "--product",
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve")
	},
	task: {
		label: "任务",
		scopeFlag: "--executionID",
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish")
	},
	testcase: {
		label: "测试用例",
		scopeFlag: "--product",
		actions: set("list", "get", "create", "update", "delete")
	},
	testtask: {
		label: "测试单",
		scopeFlag: "--productID",
		actions: set("create", "update", "delete")
	},
	productplan: {
		label: "产品计划",
		scopeFlag: "--productID",
		actions: set("create", "update", "delete")
	},
	build: {
		label: "版本",
		scopeFlag: "--project",
		actions: set("create", "update", "delete")
	},
	release: {
		label: "发布",
		scopeFlag: "--productID",
		actions: set("create", "update", "delete")
	},
	feedback: {
		label: "反馈",
		scopeFlag: "--productID",
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	ticket: {
		label: "工单",
		scopeFlag: "--productID",
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	system: {
		label: "应用",
		scopeFlag: "--productID",
		actions: set("list", "create", "update")
	},
	user: {
		label: "用户",
		scopeFlag: null,
		actions: set("list", "get", "create", "update", "delete")
	},
	file: {
		label: "附件",
		scopeFlag: null,
		actions: set("create", "delete")
	}
};
const MODULES = Object.keys(MODULE_INFO);
/** resolve 隐含必填 4 字段（服务端硬性要求，缺一个报 E2008）。 */
const RESOLVE_REQUIRED = [
	"resolution",
	"assignedTo",
	"resolvedBuild",
	"comment"
];
/**
* 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
* 校验失败抛 Error（message 面向模型，含中文提示）。
*/
function buildCliArgs(args) {
	const info = MODULE_INFO[args.module];
	if (info === void 0) throw new Error(`未知模块 ${String(args.module)}，可选：${MODULES.join("/")}`);
	const { module, action, id, fields } = args;
	if (!info.actions.has(action)) throw new Error(`${info.label}(${module}) 不支持动作 ${action}，可选：${[...info.actions].join("/")}`);
	if (action === "list") {
		const scope = info.scopeFlag;
		if (scope !== null) {
			let value;
			if (scope === "--product" || scope === "--productID") value = args.product;
			else if (scope === "--project") value = args.project;
			else if (scope === "--executionID") value = args.executionID;
			if (value === void 0 && info.scopeOptional !== true) throw new Error(`${info.label}(${module}) 列表需要 ${scope.replace(/^--/, "")} 参数`);
			return value === void 0 ? [module, "--recPerPage=200"] : [
				module,
				`${scope}=${value}`,
				"--recPerPage=200"
			];
		}
		return [module, "--recPerPage=200"];
	}
	if (action === "get") {
		if (id === void 0) throw new Error(`${info.label}(${module}) get 需要 id`);
		return [module, String(id)];
	}
	if (action === "create") return [
		module,
		"create",
		...flagArgs(fields)
	];
	if (action === "update") {
		if (id === void 0) throw new Error(`${info.label}(${module}) update 需要 id`);
		return [
			module,
			"update",
			String(id),
			...flagArgs(fields)
		];
	}
	if (action === "delete") {
		if (id === void 0) throw new Error(`${info.label}(${module}) delete 需要 id`);
		return [
			module,
			"delete",
			String(id),
			"--yes"
		];
	}
	if (action === "resolve") {
		if (id === void 0) throw new Error(`${info.label}(${module}) resolve 需要 id`);
		const missing = RESOLVE_REQUIRED.filter((k) => fields?.[k] === void 0);
		if (missing.length > 0) throw new Error(`bug resolve 必须提供 ${missing.join("、")}（resolution/assignedTo/resolvedBuild/comment 四项）`);
		return [
			module,
			"resolve",
			String(id),
			...flagArgs(fields)
		];
	}
	if (action === "start" && module === "task") {
		if (id === void 0) throw new Error(`${info.label}(${module}) start 需要 id`);
		const missing = ["realStarted"].filter((k) => fields?.[k] === void 0);
		if (missing.length > 0) throw new Error(`task start 必须提供 ${missing.join("、")}（realStarted 实际开始，必填）`);
		return [
			module,
			"start",
			String(id),
			...flagArgs(fields)
		];
	}
	if (action === "finish" && module === "task") {
		if (id === void 0) throw new Error(`${info.label}(${module}) finish 需要 id`);
		const missing = [
			"currentConsumed",
			"realStarted",
			"finishedDate"
		].filter((k) => fields?.[k] === void 0);
		if (missing.length > 0) throw new Error(`task finish 必须提供 ${missing.join("、")}（currentConsumed/realStarted/finishedDate，必填）`);
		return [
			module,
			"finish",
			String(id),
			...flagArgs(fields)
		];
	}
	if (id === void 0) throw new Error(`${info.label}(${module}) ${action} 需要 id`);
	return [
		module,
		action,
		String(id),
		...flagArgs(fields)
	];
}
function flagArgs(fields) {
	if (fields === void 0) return [];
	return Object.entries(fields).map(([k, v]) => `--${k}=${String(v)}`);
}
//#endregion
//#region lib/types/tools.js
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
const ZENTAO_PARAMETERS = {
	module: {
		type: "string",
		required: true,
		enum: MODULES,
		description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file"
	},
	action: {
		type: "string",
		required: true,
		enum: [
			"list",
			"get",
			"create",
			"update",
			"delete",
			"activate",
			"close",
			"resolve",
			"start",
			"finish",
			"change"
		],
		description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/start/finish/change，按模块校验）"
	},
	id: {
		type: "number",
		description: "对象 ID（get/update/delete/状态动作需要）。"
	},
	product: {
		type: "number",
		description: "产品 ID（列表范围参数）。story/bug/testcase 用 --product，epic/requirement/release/feedback/ticket 等用 --productID，插件自动映射。"
	},
	project: {
		type: "number",
		description: "项目 ID（列表范围参数，execution/build 需要）。"
	},
	executionID: {
		type: "number",
		description: "执行 ID（task 列表的范围参数，注意是 executionID 不是 execution）。"
	},
	fields: {
		type: "object",
		description: "字段键值对（create/update/状态动作），如 { title, assignedTo, pri, severity, status }。",
		additionalProperties: true
	}
};
function applyTools(ctx) {
	const disposers = [];
	disposers.push(ctx.systemPrompt.section({
		name: "tool:zentao",
		order: 130,
		text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish). For lists pass the module's scope param (story/bug/testcase -> product; epic/requirement/release/feedback/ticket -> productID; task -> executionID; execution/build -> project); results come back as JSON arrays (200-row cap) — filter client-side. bug resolve needs resolution + assignedTo + resolvedBuild + comment. Requires zentao CLI installed and logged in."
	}));
	disposers.push(ctx.tools.register(defineTool({
		name: "zentao",
		description: DESCRIPTION,
		parameters: ZENTAO_PARAMETERS,
		output: {
			schema: {
				type: "object",
				additionalProperties: true,
				properties: {
					module: {
						type: "string",
						required: true
					},
					action: {
						type: "string",
						required: true
					},
					data: {
						type: "json",
						required: true
					},
					count: { type: "number" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `zentao ${value.module} ${value.action}：${value.count ?? "—"} 条。数据见卡片。`
			}],
			presentationMeta: (_args, value) => ({
				module: value.module,
				action: value.action,
				data: value.data,
				count: value.count ?? 0
			})
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const zargs = args;
			const data = await runZentao(buildCliArgs(zargs));
			const count = Array.isArray(data) ? data.length : data === void 0 ? 0 : 1;
			return {
				module: zargs.module,
				action: zargs.action,
				data,
				count
			};
		},
		presentCall: (args) => ({
			card: "generic",
			title: `zentao ${args.module} ${args.action}${args.id !== void 0 ? ` #${args.id}` : ""}`,
			kind: "other",
			rawInput: args
		}),
		presentResult: (args, result) => result.isError ? void 0 : {
			card: "generic",
			title: `zentao ${args.module} ${args.action}`
		}
	})));
	return () => {
		for (const dispose of disposers) dispose?.();
	};
}
//#endregion
//#region lib/types/api.js
/**
* /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
* 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
* 内部管理）。同源路由，不暴露任何凭证。
*/
const OVERVIEW_PATH = "/__dsh-zentao__/overview";
const defaultQueries = {
	tasks: async () => [],
	bugs: async () => [],
	projects: async () => []
};
/**
* 聚合三次查询。注入 queries 便于测试；默认实现：
* - bugs: `bug --product=<p>` 逐个产品拉取（本项目产品 id 2..22）
* - projects: `project --recPerPage=200` 后按 status=doing 过滤
* - tasks: 无全局入口，返回空（CLI 局限），面板展示"任务视图需指定执行"
*/
async function overviewData(queries = defaultQueries) {
	const [tasks, bugs, projects] = await Promise.allSettled([
		queries.tasks(),
		queries.bugs(),
		queries.projects()
	]);
	const firstError = [
		tasks,
		bugs,
		projects
	].map((r) => r.status === "rejected" ? r.reason.message : void 0).find((m) => m !== void 0);
	return {
		myTasks: tasks.status === "fulfilled" && Array.isArray(tasks.value) ? tasks.value : [],
		myBugs: bugs.status === "fulfilled" && Array.isArray(bugs.value) ? bugs.value : [],
		activeProjects: projects.status === "fulfilled" && Array.isArray(projects.value) ? projects.value.filter((p) => p.status === "doing") : [],
		...firstError !== void 0 ? { error: firstError } : {}
	};
}
/** 默认查询实现：projects 全量过滤；bugs 遍历产品（可配置产品列表见下方）。 */
function createDefaultQueries(productIds) {
	return {
		tasks: async () => [],
		bugs: async () => {
			const rows = [];
			for (const pid of productIds) {
				const data = await runZentao([
					"bug",
					`--product=${pid}`,
					"--recPerPage=200"
				]);
				if (Array.isArray(data)) rows.push(...data);
			}
			return rows;
		},
		projects: async () => runZentao(["project", "--recPerPage=200"])
	};
}
function sendJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
function registerOverviewApi(ctx) {
	const webServer = ctx.webServer;
	if (webServer === void 0) return () => {};
	return webServer.register({
		kind: "exact",
		path: OVERVIEW_PATH,
		handler: async (req, res) => {
			if ((req.method ?? "GET") !== "GET") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			try {
				const products = await runZentao(["product", "--recPerPage=200"]);
				sendJson(res, 200, await overviewData(createDefaultQueries(Array.isArray(products) ? products.map((p) => Number(p.id)).filter((n) => Number.isFinite(n)) : [])));
			} catch (error) {
				sendJson(res, 200, {
					myTasks: [],
					myBugs: [],
					activeProjects: [],
					error: asCliError(error).message
				});
			}
		}
	});
}
//#endregion
//#region lib/types/index.js
const name = "zentao";
const inject = [
	"tools",
	"webServer",
	"systemPrompt"
];
function apply(ctx) {
	ensureLocalConfig();
	const disposers = [applyTools(ctx), registerOverviewApi(ctx)];
	return () => {
		for (const dispose of disposers.reverse()) dispose?.();
	};
}
//#endregion
export { apply, inject, name };
