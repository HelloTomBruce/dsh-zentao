import { createRequire } from "node:module";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
//#region lib/types/lib/config.js
/**
* 插件自包含配置路径。配置唯一来源是 dsh 用户目录下的 zentao.json
* （$DSH_HOME/zentao.json，默认 ~/.dsh/zentao.json）：CLI 调用统一携带
* ZENTAO_CONFIG_FILE 指向它；登录由侧栏面板发起，CLI 直接把凭证写入该文件。
* 本层只做路径计算与旧位置迁移，不读取、不解析凭证内容。
*
* 历史：早期版本配置放在插件安装目录（node_modules/dsh-zentao/zentao.json），
* 但 node_modules 会被 pnpm 更新/重装整体重建，登录态随之丢失（表现为"重启
* 后要重新登录"）；dsh 用户目录与 dsh 自身的 profiles/设置同级，重装插件
* 不影响，且跨 profile 共享登录态。
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
/** dsh 用户目录（与 @deepseek-ai/dsh-home-paths 的 resolveDshHome 对齐）。 */
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
/**
* 配置文件路径：dsh 用户目录下的 zentao.json（稳定位置，不随插件重装丢失）。
* root 为旧版配置所在的插件目录：旧文件存在且新位置缺失时自动迁移一次；
* 迁移失败不阻塞（CLI 按未登录处理，面板重新登录即可）。
*/
function localConfigPath(root = pluginRoot()) {
	const stable = join(dshHome(), "zentao.json");
	if (!existsSync(stable)) {
		const legacy = join(root, "zentao.json");
		if (existsSync(legacy)) try {
			mkdirSync(dirname(stable), { recursive: true });
			copyFileSync(legacy, stable);
		} catch {}
	}
	return stable;
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
	const env = {
		...process.env,
		ZENTAO_CONFIG_FILE: localConfigPath(pluginRoot())
	};
	const bundledBin = resolveBundledCliBin();
	const [runCmd, runArgs] = bundledBin ? [process.execPath, [bundledBin, ...args]] : [cmd, args];
	execFile(runCmd, runArgs, {
		timeout: 3e4,
		maxBuffer: 8388608,
		env
	}, (error, stdout, stderr) => {
		cb(error, String(stdout).trim() !== "" ? String(stdout) : String(stderr));
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
/**
* 执行 zentao CLI 但不强制 JSON 解析（用于 login 等成功时输出纯文本、
* --format=json 不生效的命令）。进程退出码 0 即成功，返回原始输出；失败时
* 优先从输出中提取 error.code/message（错误 JSON 由 CLI 写到 stderr，已在
* defaultExec 合并回退）。
*/
async function runZentaoLoose(args, exec = defaultExec) {
	const fullArgs = [...args, "--format=json"];
	return new Promise((resolve, reject) => {
		exec("zentao", fullArgs, (error, stdout) => {
			if (error === null) {
				resolve(stdout);
				return;
			}
			if (error.code === "ENOENT") {
				reject(cliErrorOf("ENOENT", "未找到 zentao CLI：插件依赖 zentao-cli 缺失且 PATH 中无全局命令，请重新安装插件（或 npm i -g zentao-cli）"));
				return;
			}
			try {
				const parsed = JSON.parse(stdout);
				if (parsed?.error !== void 0) {
					reject(cliErrorOf(String(parsed.error.code ?? "E5001"), `zentao: ${String(parsed.error.message ?? "zentao 请求失败")}`, stdout));
					return;
				}
			} catch {}
			reject(cliErrorOf("E5001", `zentao CLI 执行失败：${stdout.slice(0, 200)}`, stdout));
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
* zentao 工具的模块/动作白名单与 CLI 参数构造（适配 zentao-cli ≥ 0.3.1：
* bug 列表范围三选一、新增 my 地盘模块与 bug confirm 动作）。
* 所有列表统一 --recPerPage=200 拉全量（--filter 与分页不兼容的 pitfall
* 规避），程序侧再按需过滤。
*/
const set = (...xs) => new Set(xs);
const MODULE_INFO = {
	program: {
		label: "项目集",
		scopeFlags: [],
		actions: set("list", "get", "create", "update", "delete")
	},
	product: {
		label: "产品",
		scopeFlags: [],
		actions: set("list", "get", "create", "update", "delete")
	},
	project: {
		label: "项目",
		scopeFlags: [],
		actions: set("list", "get", "create", "update", "delete")
	},
	execution: {
		label: "执行",
		scopeFlags: ["--project"],
		scopeOptional: true,
		actions: set("list", "get", "create", "update", "delete")
	},
	story: {
		label: "需求",
		scopeFlags: ["--product"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	epic: {
		label: "业务需求",
		scopeFlags: ["--productID"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	requirement: {
		label: "用户需求",
		scopeFlags: ["--productID"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	bug: {
		label: "Bug",
		scopeFlags: [
			"--product",
			"--project",
			"--execution"
		],
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm")
	},
	task: {
		label: "任务",
		scopeFlags: ["--executionID"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish")
	},
	testcase: {
		label: "测试用例",
		scopeFlags: ["--product"],
		actions: set("list", "get", "create", "update", "delete")
	},
	testtask: {
		label: "测试单",
		scopeFlags: ["--productID"],
		actions: set("create", "update", "delete")
	},
	productplan: {
		label: "产品计划",
		scopeFlags: ["--productID"],
		actions: set("create", "update", "delete")
	},
	build: {
		label: "版本",
		scopeFlags: ["--project"],
		actions: set("create", "update", "delete")
	},
	release: {
		label: "发布",
		scopeFlags: ["--productID"],
		actions: set("create", "update", "delete")
	},
	feedback: {
		label: "反馈",
		scopeFlags: ["--productID"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	ticket: {
		label: "工单",
		scopeFlags: ["--productID"],
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	system: {
		label: "应用",
		scopeFlags: ["--productID"],
		actions: set("list", "create", "update")
	},
	user: {
		label: "用户",
		scopeFlags: [],
		actions: set("list", "get", "create", "update", "delete")
	},
	file: {
		label: "附件",
		scopeFlags: [],
		actions: set("create", "delete")
	},
	my: {
		label: "地盘（指派给我的）",
		scopeFlags: [],
		actions: set("todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks")
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
* 从入参解析首个已提供的范围参数（--execution 与 --executionID 均读
* executionID 入参；返回 flag+value 供拼 CLI 参数）。
*/
function scopeValueOf(args, flags) {
	for (const flag of flags) {
		const value = flag === "--product" || flag === "--productID" ? args.product : flag === "--project" ? args.project : flag === "--execution" || flag === "--executionID" ? args.executionID : void 0;
		if (value !== void 0) return {
			flag,
			value
		};
	}
}
/**
* 把工具入参构造成 CLI 参数数组（不含 --format=json，由调用层追加）。
* 校验失败抛 Error（message 面向模型，含中文提示）。
*/
function buildCliArgs(args) {
	const info = MODULE_INFO[args.module];
	if (info === void 0) throw new Error(`未知模块 ${String(args.module)}，可选：${MODULES.join("/")}`);
	const { module, action, id, fields } = args;
	if (!info.actions.has(action)) throw new Error(`${info.label}(${module}) 不支持动作 ${action}，可选：${[...info.actions].join("/")}`);
	if (module === "my") return [
		module,
		action,
		"--recPerPage=200"
	];
	if (action === "list") {
		const scopes = info.scopeFlags;
		if (scopes.length > 0) {
			const provided = scopeValueOf(args, scopes);
			if (provided === void 0 && info.scopeOptional !== true) throw new Error(`${info.label}(${module}) 列表需要 ${scopes.map((f) => f.replace(/^--/, "")).join(" / ")} 参数`);
			return provided === void 0 ? [module, "--recPerPage=200"] : [
				module,
				`${provided.flag}=${provided.value}`,
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

Usage: pick a \`module\` (story/bug/task/project/execution/product/my/...) and an \`action\`:
- list: fetch rows (pass the module's scope param, e.g. bug -> product, release -> productID, task -> executionID)
- get <id>: fetch one object
- create: pass \`fields\` (e.g. title, assignedTo, pri)
- update <id>: pass changed \`fields\` only (CLI backfills the rest)
- delete <id>
- status actions per module: bug -> activate/close/confirm/resolve; task -> activate/close/start/finish; story -> activate/close/change
- my module (assigned-to-me lists, no scope needed): action = tasks / bugs / stories / epics / requirements / todos / projects / testtasks / testcases / feedbacks / tickets / meetings / issues / risks

Scope flags by module family:
- \`--product\`: story / bug / testcase
- \`--project\` or \`--execution\`: bug (any one of product/project/execution)
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
		description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file/my（地盘，指派给我的）"
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
			"confirm",
			"start",
			"finish",
			"change",
			"todos",
			"tasks",
			"bugs",
			"stories",
			"epics",
			"requirements",
			"testtasks",
			"projects",
			"feedbacks",
			"tickets",
			"testcases",
			"meetings",
			"issues",
			"risks"
		],
		description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/confirm/start/finish/change，按模块校验）；模块为 my 时动作即资源名（tasks/bugs/stories… 指派给我的）"
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
		text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish/confirm). For lists pass the module's scope param (story/testcase -> product; bug -> product or project or execution; task -> executionID; execution/build -> project); results come back as JSON arrays (200-row cap) — filter client-side. bug resolve needs resolution + assignedTo + resolvedBuild + comment. For assigned-to-me data use module=my (actions: tasks/bugs/stories/todos/projects/...). Requires zentao CLI installed and logged in."
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
//#region lib/types/lib/workspace-config.js
/**
* 工作区级禅道绑定配置。每个 DSH 工作区根目录下一个 .dsh-zentao.json，
* 声明该工作区所属的禅道产品/执行/项目，概览面板据此拉取任务与 Bug：
* - 任务视图：需要 execution（task 列表必须按执行，CLI 无全局入口）
* - Bug 视图：product / project / execution 任一（0.3.1 CLI 支持三选一）
* 本层只读文件与校验，不涉及凭证。
*/
/** 工作区配置文件名（位于工作区根目录）。 */
const WORKSPACE_CONFIG_FILENAME = ".dsh-zentao.json";
/** 解析配置文件内容；非法 JSON 或字段类型不对时返回错误信息。 */
function parseWorkspaceConfig(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			config: null,
			error: "不是合法 JSON"
		};
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {
		config: null,
		error: "配置必须是 JSON 对象"
	};
	const obj = parsed;
	const config = {};
	const bad = [];
	for (const key of [
		"product",
		"project",
		"execution"
	]) {
		const value = obj[key];
		if (value === void 0) continue;
		const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
		if (!Number.isInteger(num) || num <= 0) {
			bad.push(key);
			continue;
		}
		config[key] = num;
	}
	if (bad.length > 0) return {
		config: null,
		error: `字段 ${bad.join("、")} 必须是正整数`
	};
	if (config.product === void 0 && config.project === void 0 && config.execution === void 0) return {
		config: null,
		error: "至少需要 product / project / execution 之一"
	};
	return { config };
}
/** Bug 视图的范围参数：product > project > execution 优先（0.3.1 CLI 三选一）。 */
function bugScopeOf(config) {
	if (config.product !== void 0) return {
		flag: "--product",
		value: config.product
	};
	if (config.project !== void 0) return {
		flag: "--project",
		value: config.project
	};
	if (config.execution !== void 0) return {
		flag: "--execution",
		value: config.execution
	};
	return null;
}
/**
* 读取工作区配置。文件不存在返回 { config: null }（未配置是正常态，
* 面板显示引导而非报错）；读失败/解析失败返回错误。
*/
async function readWorkspaceConfig(workspacePath) {
	const file = join(workspacePath, WORKSPACE_CONFIG_FILENAME);
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (err) {
		const code = err.code;
		if (code === "ENOENT") return {
			ok: true,
			config: null
		};
		if (code === "ENOTDIR" || code === "EACCES") return {
			ok: false,
			error: `无法读取 ${WORKSPACE_CONFIG_FILENAME}：${code}`
		};
		return {
			ok: false,
			error: `读取 ${WORKSPACE_CONFIG_FILENAME} 失败：${code ?? "未知错误"}`
		};
	}
	const { config, error } = parseWorkspaceConfig(raw);
	if (config === null) return {
		ok: false,
		error: error ?? "配置无效"
	};
	return {
		ok: true,
		config
	};
}
//#endregion
//#region lib/types/api.js
/**
* /__dsh-zentao__/overview 数据端点：按工作区绑定配置（<工作区>/.dsh-zentao.json）
* 聚合"该工作区所属执行的任务 + 所属范围的 Bug"两个视图，供客户端面板
* fetch。数据经 zentao CLI 子进程获取（凭证由 CLI 内部管理），同源路由，
* 不暴露任何凭证。登录端点与配置见文件末尾。
*/
const OVERVIEW_PATH = "/__dsh-zentao__/overview";
const LOGIN_PATH = "/__dsh-zentao__/login";
/**
* 按工作区配置构造两次 CLI 查询。注入 queries 便于测试：
* - tasks: `task --executionID=<id> --recPerPage=200`（execution 缺省 → 空数组 + note）
* - bugs: `bug --product|--project|--execution=<id> --recPerPage=200`
*/
function createQueries(config, run = runZentao) {
	return {
		tasks: config.execution === void 0 ? async () => [] : () => run([
			"task",
			`--executionID=${config.execution}`,
			"--recPerPage=200"
		]),
		bugs: (() => {
			const scope = bugScopeOf(config);
			return scope === null ? async () => [] : () => run([
				"bug",
				`${scope.flag}=${scope.value}`,
				"--recPerPage=200"
			]);
		})()
	};
}
/** 聚合两次查询；单边失败时另一边仍返回，并透出首个错误信息。 */
async function overviewData(config, queries) {
	const [tasks, bugs] = await Promise.allSettled([queries.tasks(), queries.bugs()]);
	const firstError = [tasks, bugs].map((r) => r.status === "rejected" ? r.reason.message : void 0).find((m) => m !== void 0);
	const rows = (r) => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [];
	return {
		tasks: rows(tasks),
		bugs: rows(bugs),
		config,
		...config.execution === void 0 ? { note: `配置缺 execution，任务视图为空（在 ${WORKSPACE_CONFIG_FILENAME} 中补充）` } : {},
		...firstError !== void 0 ? { error: firstError } : {}
	};
}
function sendJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
/** 由登录表单构造 CLI 参数；token 优先于 password。缺少必要字段返回 null。 */
function buildLoginArgs(body) {
	const server = body.server?.trim();
	const account = body.account?.trim();
	if (!server || !account) return null;
	const args = [
		"login",
		"-s",
		server,
		"-u",
		account
	];
	const token = body.token?.trim();
	if (token) return [
		...args,
		"-t",
		token
	];
	if (body.password) return [
		...args,
		"-p",
		body.password
	];
	return null;
}
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
/**
* POST /__dsh-zentao__/login：面板登录入口。转发 zentao login（凭证经 CLI
* 写入 dsh 用户目录的 zentao.json，不经由本层保存）。login 成功输出纯文本
* 而非 JSON，故默认用宽松的 runZentaoLoose；run 可注入便于测试。
*/
function registerLoginApi(ctx, run = runZentaoLoose) {
	const webServer = ctx.webServer;
	if (webServer === void 0) return () => {};
	return webServer.register({
		kind: "exact",
		path: LOGIN_PATH,
		handler: async (req, res) => {
			if ((req.method ?? "GET") !== "POST") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				sendJson(res, 400, { error: "请求体不是合法 JSON" });
				return;
			}
			const args = buildLoginArgs(body);
			if (args === null) {
				sendJson(res, 400, { error: "缺少 server / account，或 password / token 均未提供" });
				return;
			}
			try {
				await run(args);
				sendJson(res, 200, { ok: true });
			} catch (error) {
				sendJson(res, 200, {
					ok: false,
					error: asCliError(error).message
				});
			}
		}
	});
}
/** overview 结果缓存 TTL：面板重复打开直接命中，避免重复 CLI 调用。 */
const OVERVIEW_CACHE_TTL = 6e4;
/** 从请求 URL 解析 workspace 查询参数（URL 解码；decode 失败返回 undefined）。 */
function workspaceOf(req) {
	const url = req.url ?? "";
	const match = /[?&]workspace=([^&]*)/.exec(url);
	if (match === null || match[1] === void 0 || match[1] === "") return void 0;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return;
	}
}
/**
* GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&fresh=1]：
* 读该工作区的 .dsh-zentao.json，按配置拉取任务与 Bug。缓存按工作区分键
* （60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
*/
function registerOverviewApi(ctx, deps = {}) {
	const webServer = ctx.webServer;
	if (webServer === void 0) return () => {};
	const readConfig = deps.readConfig ?? readWorkspaceConfig;
	const cache = /* @__PURE__ */ new Map();
	const inflight = /* @__PURE__ */ new Map();
	const compute = async (workspace) => {
		const result = await readConfig(workspace);
		if (!result.ok) return {
			tasks: [],
			bugs: [],
			error: `${WORKSPACE_CONFIG_FILENAME}：${result.error}`
		};
		if (result.config === null) return {
			tasks: [],
			bugs: [],
			unconfigured: true
		};
		return overviewData(result.config, createQueries(result.config, deps.run));
	};
	return webServer.register({
		kind: "exact",
		path: OVERVIEW_PATH,
		handler: async (req, res) => {
			if ((req.method ?? "GET") !== "GET") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			const workspace = workspaceOf(req);
			if (workspace === void 0) {
				sendJson(res, 400, {
					tasks: [],
					bugs: [],
					error: "缺少 workspace 查询参数（工作区绝对路径）"
				});
				return;
			}
			try {
				const fresh = (req.url ?? "").includes("fresh=1");
				const key = workspace;
				if (!fresh) {
					const hit = cache.get(key);
					if (hit !== void 0 && Date.now() - hit.at < OVERVIEW_CACHE_TTL) {
						sendJson(res, 200, hit.data);
						return;
					}
				}
				let pending = inflight.get(key);
				if (pending === void 0) {
					pending = compute(workspace).then((data) => {
						cache.set(key, {
							at: Date.now(),
							data
						});
						return data;
					}).finally(() => {
						inflight.delete(key);
					});
					inflight.set(key, pending);
				}
				sendJson(res, 200, await pending);
			} catch (error) {
				sendJson(res, 200, {
					tasks: [],
					bugs: [],
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
	const disposers = [
		applyTools(ctx),
		registerOverviewApi(ctx),
		registerLoginApi(ctx)
	];
	return () => {
		for (const dispose of disposers.reverse()) dispose?.();
	};
}
//#endregion
export { apply, inject, name };
