import { createRequire } from "node:module";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
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
/** 从 dsh 用户目录下的 zentao.json 中读取当前登录的账号与服务地址。 */
function readCurrentProfileInfo(root = pluginRoot()) {
	try {
		const stable = localConfigPath(root);
		if (!existsSync(stable)) return null;
		const raw = JSON.parse(readFileSync(stable, "utf8"));
		const profiles = raw.profiles ?? [];
		const current = profiles.find((p) => p.account && p.server && `${p.account}@${p.server}` === raw.currentProfile) ?? profiles[0];
		if (current?.account) return {
			account: current.account,
			server: current.server,
			token: current.token,
			realname: current.user?.realname
		};
		return null;
	} catch {
		return null;
	}
}
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
* 管理（配置唯一来源是 $DSH_HOME/zentao.json，经 ZENTAO_CONFIG_FILE 指向，
* 见 ./config.ts），本层不读取、不接触任何凭证。
* 适配 zentao-cli ≥ 0.5.0：JSON 信封 {ok, data|error, meta}，错误码无前缀
* （如 "1006"）。
*/
/**
* 针对禅道多应用架构（Project / Execution 等不同上下文）：
* 迭代/执行若归属于项目（Scrum sprint），需要 project 应用上下文（等同于 Web 端的 #app=project）
* 才能完整解析项目迭代与成员权限。通过为 CLI fetch 请求注入默认 Cookie，对齐 Web 端行为。
*/
const PRELOAD_SOURCE = `
if (typeof globalThis.fetch === "function") {
  const origFetch = globalThis.fetch;
  globalThis.fetch = function(url, init = {}) {
    const headers = new Headers(init?.headers || {});
    const existingCookie = headers.get("cookie") || "";
    const extra = "tab=project; app=project";
    headers.set("cookie", existingCookie ? \`\${existingCookie}; \${extra}\` : extra);
    return origFetch(url, { ...init, headers });
  };
}
`;
function ensurePreloadScript(root = pluginRoot()) {
	try {
		const p = join(root, "lib", "preload.cjs");
		if (!existsSync(p)) {
			mkdirSync(dirname(p), { recursive: true });
			writeFileSync(p, PRELOAD_SOURCE.trim(), "utf8");
		}
		return p;
	} catch {
		return null;
	}
}
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
	const preload = ensurePreloadScript();
	const nodeOptions = [process.env.NODE_OPTIONS, preload ? `-r ${preload}` : null].filter(Boolean).join(" ").trim();
	const env = {
		...process.env,
		ZENTAO_CONFIG_FILE: localConfigPath(pluginRoot()),
		...nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}
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
	return {
		data: obj?.data,
		...obj?.meta !== void 0 ? { meta: obj.meta } : {}
	};
}
/**
* 执行 zentao CLI。args 不含 --format=json（自动追加）。
* @returns CLI JSON 输出的 data 与 meta（列表的完整性元数据：total/truncated/hasMore 等）。
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
* zentao 工具的模块/动作白名单与 CLI 参数构造（适配 zentao-cli ≥ 0.5.0：
* - 列表/详情必须显式子命令：`bug list` / `bug get <id>`（0.3.x 的默认动作已移除）
* - `--recPerPage=200` 已移除，列表统一 `--all` 显式遍历全部页面
* - task 列表 scope 为 `--execution-id`（kebab-case）
* - 写操作字段经 `--data <json>` 透传（camelCase 字段名原样保留，CLI 按
*   schema 校验类型）；scope 字段（product/executionID…）不是请求体字段，
*   create 时按模块映射为 `--product-id` / `--execution-id` 等独立 flag
* - file create 走 multipart formdata 不支持 JSON，字段转 kebab-case flag
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
		scopeFlags: [],
		scopeOptional: true,
		createScope: { project: "--project" },
		actions: set("list", "get", "create", "update", "delete")
	},
	story: {
		label: "需求",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	epic: {
		label: "业务需求",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	requirement: {
		label: "用户需求",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "change")
	},
	bug: {
		label: "Bug",
		scopeFlags: [
			"--product",
			"--project",
			"--execution"
		],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm")
	},
	task: {
		label: "任务",
		scopeFlags: ["--execution-id"],
		createScope: { executionID: "--execution-id" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish")
	},
	testcase: {
		label: "测试用例",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	testtask: {
		label: "测试单",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	productplan: {
		label: "产品计划",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	build: {
		label: "版本",
		scopeFlags: ["--project"],
		createScope: {
			executionID: "--execution-id",
			product: "--product"
		},
		actions: set("list", "get", "create", "update", "delete")
	},
	release: {
		label: "发布",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	feedback: {
		label: "反馈",
		scopeFlags: ["--product"],
		createScope: { product: "--product" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	ticket: {
		label: "工单",
		scopeFlags: ["--product"],
		createScope: { product: "--product" },
		actions: set("list", "get", "create", "update", "delete", "activate", "close")
	},
	system: {
		label: "应用",
		scopeFlags: ["--product"],
		createScope: { product: "--product-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	user: {
		label: "用户",
		scopeFlags: [],
		actions: set("list", "get", "create", "update", "delete")
	},
	file: {
		label: "附件",
		scopeFlags: [],
		actions: set("create", "delete", "get", "read")
	},
	knowledge: {
		label: "AI 知识库",
		scopeFlags: [],
		actions: set("list", "get", "search", "embeddingsSearch")
	},
	doc: {
		label: "文档",
		scopeFlags: [],
		actions: set("mySpaces", "teamSpaces", "productSpaces", "projectSpaces", "myLibs", "teamLibs", "productLibs", "projectLibs", "myDocs", "teamDocs", "productDocs", "projectDocs", "get")
	},
	weekly: {
		label: "项目周报",
		scopeFlags: ["--project"],
		createScope: { project: "--project-id" },
		actions: set("list", "get", "create", "update", "delete")
	},
	relation: {
		label: "对象关联",
		scopeFlags: [],
		actions: set("list", "candidates")
	},
	my: {
		label: "地盘（指派给我的）",
		scopeFlags: [],
		actions: set("todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks")
	}
};
const MODULES = Object.keys(MODULE_INFO);
/** resolve 隐含必填 4 字段（服务端硬性要求，缺一个报 2003）。 */
const RESOLVE_REQUIRED = [
	"resolution",
	"assignedTo",
	"resolvedBuild",
	"comment"
];
/**
* 从入参解析首个已提供的范围参数（--execution 与 --execution-id 均读
* executionID 入参；返回 flag+value 供拼 CLI 参数）。
*/
function scopeValueOf(args, flags) {
	for (const flag of flags) {
		const value = flag === "--product" ? args.product : flag === "--project" ? args.project : flag === "--execution" || flag === "--execution-id" ? args.executionID : void 0;
		if (value !== void 0) return {
			flag,
			value
		};
	}
}
/** camelCase 字段名转 CLI 的 kebab-case flag 名（realStarted → real-started，objectID → object-id）。 */
function kebab(key) {
	return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}
/** file 模块专用：fields → kebab-case flag 列表（multipart formdata 不支持 --data）。 */
function flagArgs(fields) {
	if (fields === void 0) return [];
	return Object.entries(fields).map(([k, v]) => `--${kebab(k)}=${String(v)}`);
}
/** 非 scope 字段经 --data JSON 透传（camelCase 原样保留，CLI 按 schema 校验）。 */
function dataArgs(fields) {
	if (fields === void 0 || Object.keys(fields).length === 0) return [];
	return ["--data", JSON.stringify(fields)];
}
/** 列表查询参数（browseType/filter/search/sort/pick/maxItems/htmlToMarkdown）→ CLI flags。filterOverride 用于合并后的过滤表达式（如 execution 的 project scope）。 */
function queryArgs(args, filterOverride) {
	const filter = filterOverride ?? args.filter;
	const out = [];
	if (args.browseType !== void 0) out.push(`--browse-type=${args.browseType}`);
	if (filter !== void 0) out.push(`--filter=${filter}`);
	if (args.search !== void 0) out.push(`--search=${args.search}`);
	if (args.searchFields !== void 0) out.push(`--search-fields=${args.searchFields}`);
	if (args.sort !== void 0) out.push(`--sort=${args.sort}`);
	if (args.pick !== void 0) out.push(`--fields=${args.pick}`);
	if (args.maxItems !== void 0) out.push(`--max-items=${args.maxItems}`);
	if (args.htmlToMarkdown === true) out.push("--html-to-markdown");
	return out;
}
/** 是否携带了仅列表可用的查询参数（用于非 list 动作的误用拦截）。 */
function hasQueryArgs(args) {
	return args.browseType !== void 0 || args.filter !== void 0 || args.search !== void 0 || args.searchFields !== void 0 || args.sort !== void 0 || args.pick !== void 0 || args.maxItems !== void 0 || args.htmlToMarkdown !== void 0;
}
/** 列表式动作（查询参数生效）：list、my 全部动作、doc 的非 get 动作、relation 全部动作。 */
function isListLike(module, action) {
	if (module === "my" || module === "relation") return true;
	if (module === "doc") return action !== "get";
	return action === "list";
}
/**
* create 参数构造：fields 中的 scope 字段（按模块 createScope 映射表）提为
* 独立 flag，其余经 --data 透传。模型在 fields 里写 execution 或 executionID
* 均可（统一归一为 executionID 查表）。
*/
function createArgs(info, fields) {
	const scopeMap = info.createScope ?? {};
	const scopeArgs = [];
	const rest = {};
	for (const [k, v] of Object.entries(fields ?? {})) {
		const flag = scopeMap[k] ?? (k === "execution" ? scopeMap.executionID : void 0);
		if (flag !== void 0) scopeArgs.push(`${flag}=${String(v)}`);
		else rest[k] = v;
	}
	return [...scopeArgs, ...dataArgs(rest)];
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
	if (!isListLike(module, action) && hasQueryArgs(args)) throw new Error(`browseType/filter/search/searchFields/sort/pick/maxItems/htmlToMarkdown 仅在列表式动作上生效（当前 ${module} ${action}）`);
	if (module === "my") return [
		module,
		action,
		...queryArgs(args),
		"--all"
	];
	if (module === "doc") {
		if (action === "get") {
			if (id === void 0) throw new Error(`${info.label}(doc) get 需要 id`);
			return [
				"doc",
				"get",
				String(id)
			];
		}
		const docArgs = ["doc", kebab(action)];
		if (fields?.spaceID !== void 0) docArgs.push(`--space-id=${fields.spaceID}`);
		if (fields?.libID !== void 0) docArgs.push(`--lib-id=${fields.libID}`);
		docArgs.push(...queryArgs(args));
		return docArgs;
	}
	if (module === "knowledge") {
		if (action === "list") {
			const libID = id ?? fields?.libID;
			if (libID === void 0) throw new Error(`${info.label}(knowledge) list 需要 id（知识库 libID）或 fields.libID`);
			return [
				"knowledge",
				"list",
				String(libID),
				...queryArgs(args),
				"--all"
			];
		}
		if (action === "get") {
			if (id === void 0) throw new Error(`${info.label}(knowledge) get 需要 id`);
			return [
				"knowledge",
				"get",
				String(id)
			];
		}
		return [
			"knowledge",
			kebab(action),
			...dataArgs(fields)
		];
	}
	if (module === "relation") {
		const objectType = fields?.objectType;
		if (objectType === void 0 || id === void 0) throw new Error(`${info.label}(relation) ${action} 需要 fields.objectType 与 id（objectID），如 fields={objectType:"bug"} id=123`);
		const rest = { ...fields };
		delete rest.objectType;
		const relArgs = [
			"relation",
			action,
			String(objectType),
			`--object-id=${id}`
		];
		if (action === "candidates") {
			const related = rest.relatedObjectType;
			if (related === void 0) throw new Error(`relation candidates 需要 fields.relatedObjectType（候选对象类型，如 task/bug）`);
			relArgs.push(`--related-object-type=${String(related)}`);
			delete rest.relatedObjectType;
		}
		if (Object.keys(rest).length > 0) throw new Error(`relation ${action} 不支持字段：${Object.keys(rest).join("、")}（仅 objectType/relatedObjectType + 查询参数）`);
		relArgs.push(...queryArgs(args));
		if (action === "candidates") relArgs.push("--all");
		return relArgs;
	}
	if (module === "file" && action === "read") {
		if (id === void 0) throw new Error(`${info.label}(file) read 需要 id（附件 ID）`);
		const saveTo = fields?.saveTo !== void 0 ? String(fields.saveTo) : `.dsh-zentao/attachments/file-${id}`;
		return [
			"file",
			"read",
			String(id),
			"--output",
			saveTo
		];
	}
	if (action === "list") {
		const listArgs = [module, "list"];
		let filter = args.filter;
		if (module === "execution") {
			if (args.project !== void 0) filter = filter === void 0 ? `project=${args.project}` : `project=${args.project},${filter}`;
		} else if (info.scopeFlags.length > 0) {
			const provided = scopeValueOf(args, info.scopeFlags);
			if (provided === void 0 && info.scopeOptional !== true) throw new Error(`${info.label}(${module}) 列表需要 ${info.scopeFlags.map((f) => f.replace(/^--/, "")).join(" / ")} 参数`);
			if (provided !== void 0) listArgs.push(`${provided.flag}=${provided.value}`);
		}
		listArgs.push(...filter === args.filter ? queryArgs(args) : queryArgs(args, filter), "--all");
		return listArgs;
	}
	if (action === "get") {
		if (id === void 0) throw new Error(`${info.label}(${module}) get 需要 id`);
		return [
			module,
			"get",
			String(id)
		];
	}
	if (action === "create") {
		if (module === "file") return [
			module,
			"create",
			...flagArgs(fields)
		];
		return [
			module,
			"create",
			...createArgs(info, fields)
		];
	}
	if (action === "update") {
		if (id === void 0) throw new Error(`${info.label}(${module}) update 需要 id`);
		return [
			module,
			"update",
			String(id),
			...dataArgs(fields)
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
			...dataArgs(fields)
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
			...dataArgs(fields)
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
			...dataArgs(fields)
		];
	}
	if (id === void 0) throw new Error(`${info.label}(${module}) ${action} 需要 id`);
	return [
		module,
		action,
		String(id),
		...dataArgs(fields)
	];
}
//#endregion
//#region lib/types/tools.js
const DESCRIPTION = `Query or operate ZenTao (禅道) project data through the installed \`zentao\` CLI.

Usage: pick a \`module\` (story/bug/task/project/execution/product/my/...) and an \`action\`:
- list: fetch rows across all pages (pass the module's scope param, e.g. bug -> product, release -> product, task -> executionID)
- get <id>: fetch one object
- create: pass \`fields\` (e.g. title, assignedTo, pri; scope fields like product/executionID go in fields too — the plugin maps them to the right CLI flags)
- update <id>: pass changed \`fields\` only
- delete <id>
- status actions per module: bug -> activate/close/confirm/resolve; task -> activate/close/start/finish; story -> activate/close/change
- my module (assigned-to-me lists, no scope needed): action = tasks / bugs / stories / epics / requirements / todos / projects / testtasks / testcases / feedbacks / tickets / meetings / issues / risks

Special modules:
- file: get (attachment info) / read (download attachment to local disk; fields.saveTo sets the path, default .dsh-zentao/attachments/file-<id>; needs server 23.0+) / create (upload local file: fields={file, objectType, objectID}) / delete
- knowledge (AI 知识库, 22.7+): list (id = libID) / get / search (fields={keywords:[...], libIDs:[...]}) / embeddingsSearch (fields={keyword, libIDs:[...], minSimilarity?, limit?})
- doc (文档, 22.5+): action = mySpaces / teamSpaces / productSpaces / projectSpaces / myLibs / teamLibs / productLibs / projectLibs / myDocs / teamDocs / productDocs / projectDocs (fields.spaceID / fields.libID as required) / get <id>
- weekly (项目周报, 22.7+): list (project) / get / create / update / delete
- relation (对象关联, 22.7+): list / candidates — fields.objectType (e.g. "story") + id (objectID); candidates also needs fields.relatedObjectType (e.g. "task")

Scope params by module family:
- \`product\`: story / bug / testcase / epic / requirement / testtask / productplan / release / feedback / ticket / system
- \`project\`: execution / build
- \`executionID\`: task
- bug list also accepts \`project\` or \`executionID\` instead of \`product\` (any one)

Notes:
- bug resolve requires resolution + assignedTo + resolvedBuild + comment (server-enforced).
- Lists fetch ALL pages by default. Use query params to narrow: browseType (status), filter (conditions, comma = AND), search (keywords), sort (e.g. id:desc), maxItems (cap; result carries truncated + total when capped), pick (comma-separated field whitelist — STRONGLY recommended for large lists to save tokens, e.g. pick="id,title,status,assignedTo"), htmlToMarkdown (rich text -> Markdown).
- Field names in \`fields\` are camelCase API field names (e.g. realStarted, resolvedBuild); the plugin passes them through to the CLI as JSON.
- zentao-cli ships as a plugin runtime dependency (no global install needed); login must be done once beforehand (zentao login, credentials managed by the CLI)`;
const ZENTAO_PARAMETERS = {
	module: {
		type: "string",
		required: true,
		enum: MODULES,
		description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file（附件，read 下载需服务端 23.0+）/knowledge（AI 知识库，22.7+）/doc（文档，22.5+）/weekly（项目周报，22.7+）/relation（对象关联，22.7+）/my（地盘，指派给我的，22.5+）"
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
			"read",
			"search",
			"candidates",
			"embeddingsSearch",
			"mySpaces",
			"teamSpaces",
			"productSpaces",
			"projectSpaces",
			"myLibs",
			"teamLibs",
			"productLibs",
			"projectLibs",
			"myDocs",
			"teamDocs",
			"productDocs",
			"projectDocs",
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
		description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/confirm/start/finish/change，按模块校验）；file 模块另有 read（下载附件到本地，fields.saveTo 指定路径）；knowledge 模块有 search/embeddingsSearch；relation 模块有 list/candidates；doc 模块动作即资源名（myDocs/productLibs…）；模块为 my 时动作即资源名（tasks/bugs/stories… 指派给我的）"
	},
	id: {
		type: "number",
		description: "对象 ID（get/update/delete/状态动作需要）。"
	},
	product: {
		type: "number",
		description: "产品 ID（列表范围参数）。story/bug/testcase/epic/requirement/testtask/productplan/release/feedback/ticket/system 的列表用此参数。"
	},
	project: {
		type: "number",
		description: "项目 ID（列表范围参数，execution/build 需要；bug 列表也可用它作范围）。"
	},
	executionID: {
		type: "number",
		description: "执行 ID（task 列表的范围参数；bug 列表也可用它作范围）。"
	},
	fields: {
		type: "object",
		description: "字段键值对（create/update/状态动作），camelCase API 字段名，如 { title, assignedTo, pri, severity }；数组字段直接给数组（如 bug 的 openedBuild: [\"trunk\"]）；create 时 scope 字段（product/executionID/project）也放这里，插件自动映射为对应 CLI flag。",
		additionalProperties: true
	},
	maxItems: {
		type: "number",
		description: "最多返回条数（list/my 生效）；不给则 --all 拉全量。给定时结果带 truncated=true 表示截断（total 为全集条数）。"
	},
	browseType: {
		type: "string",
		description: "列表状态过滤（list/my 生效），取值随模块：task 默认 unclosed，还有 doing/done/all 等；bug 有 unclosed/unresolved/all 等。"
	},
	filter: {
		type: "string",
		description: "条件过滤表达式（list/my 生效，拉取范围内过滤），逗号分隔为 AND，如 status=active,pri=1。"
	},
	search: {
		type: "string",
		description: "关键词搜索（list/my 生效，拉取范围内），逗号分隔关键词为 AND。"
	},
	searchFields: {
		type: "string",
		description: "限定 search 的字段（list/my 生效，逗号分隔），缺省搜全部字段。"
	},
	sort: {
		type: "string",
		description: "排序（list/my 生效），如 id:desc、pri:asc。"
	},
	pick: {
		type: "string",
		description: "返回字段裁剪（list/my 生效，逗号分隔）——大列表先用它只拿需要的列（如 id,title,status,assignedTo），显著省 token。"
	},
	htmlToMarkdown: {
		type: "boolean",
		description: "把富文本字段（desc/steps 等）转为 Markdown（list/my 生效），默认 false 原样返回 HTML。"
	}
};
function applyTools(ctx) {
	const disposers = [];
	disposers.push(ctx.systemPrompt.section({
		name: "tool:zentao",
		order: 130,
		text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish/confirm). For lists pass the module's scope param (story/testcase -> product; bug -> product or project or execution; task -> executionID; execution/build -> project); lists fetch all pages — narrow with query params: pick (field whitelist, saves tokens on big lists), browseType/filter/search/sort/maxItems, htmlToMarkdown. Result carries total/truncated when capped by maxItems. bug resolve needs resolution + assignedTo + resolvedBuild + comment. For assigned-to-me data use module=my (actions: tasks/bugs/stories/todos/projects/...). Requires zentao CLI installed and logged in."
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
					count: { type: "number" },
					total: { type: "number" },
					truncated: { type: "boolean" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `zentao ${value.module} ${value.action}：${value.count ?? "—"} 条${value.truncated === true ? `（共 ${value.total ?? "?"} 条，已按 maxItems 截断）` : ""}。数据见卡片。`
			}],
			presentationMeta: (_args, value) => ({
				module: value.module,
				action: value.action,
				data: value.data,
				count: value.count ?? 0,
				...value.total !== void 0 ? { total: value.total } : {},
				...value.truncated !== void 0 ? { truncated: value.truncated } : {}
			})
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const zargs = args;
			if (zargs.module === "file" && zargs.action === "read" && zargs.id !== void 0) {
				const saveTo = zargs.fields?.saveTo !== void 0 ? String(zargs.fields.saveTo) : `.dsh-zentao/attachments/file-${zargs.id}`;
				mkdirSync(dirname(resolve(saveTo)), { recursive: true });
			}
			const result = await runZentao(buildCliArgs(zargs));
			const data = result.data;
			const meta = result.meta;
			const count = Array.isArray(data) ? data.length : data === void 0 ? 0 : 1;
			const total = typeof meta?.total === "number" ? meta.total : void 0;
			const truncated = meta?.truncated === true || meta?.hasMore === true ? true : void 0;
			return {
				module: zargs.module,
				action: zargs.action,
				data,
				count,
				...total !== void 0 ? { total } : {},
				...truncated !== void 0 ? { truncated } : {}
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
* - Bug 视图：product / project / execution 任一（CLI bug list 范围三选一别名）
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
/** Bug 视图的范围参数：product > project > execution 优先（bug list 三选一别名）。 */
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
const FILE_PATH = "/__dsh-zentao__/file";
/**
* 面板表格实际渲染的列（panel.tsx 卡片/表格共同用到的字段）。
* overview 查询用 --fields 裁剪到这些列，降低子进程传输与序列化开销。
* 未知字段会被 CLI 静默丢弃（实测），故裁剪是安全的。导出供测试共享单一事实源。
*/
const TASK_PANEL_FIELDS = "id,name,status,pri,deadline,assignedTo,assignedToRealName,openedBy,execution";
const BUG_PANEL_FIELDS = "id,title,status,pri,severity,deadline,assignedTo,assignedToRealName,openedBy";
/**
* 按工作区配置构造两次 CLI 查询（zentao-cli ≥ 0.5.0 命令面）。注入 queries 便于测试：
* - tasks: `task list --execution-id=<id> --fields=<面板列> [--browse-type/--filter] --all`（execution 缺省 → 空数组 + note）
* - bugs: `bug list --product|--project|--execution=<id> --fields=<面板列> [--browse-type/--filter] --all`
* 默认 run 解包 runZentao 的 {data, meta}，只取 data（面板暂不需要完整性元数据）。
*/
function createQueries(config, run, filters = {}) {
	const runData = run ?? (async (args) => (await runZentao(args)).data);
	const taskExtra = [...filters.taskBrowse !== void 0 ? [`--browse-type=${filters.taskBrowse}`] : [], ...filters.taskFilter !== void 0 ? [`--filter=${filters.taskFilter}`] : []];
	const bugExtra = [...filters.bugBrowse !== void 0 ? [`--browse-type=${filters.bugBrowse}`] : [], ...filters.bugFilter !== void 0 ? [`--filter=${filters.bugFilter}`] : []];
	return {
		tasks: config.execution === void 0 ? async () => [] : async () => {
			const args = [
				"task",
				"list",
				`--execution-id=${config.execution}`,
				`--fields=${TASK_PANEL_FIELDS}`,
				...taskExtra,
				"--all"
			];
			for (let attempt = 0; attempt < 3; attempt++) {
				const res = await runData(args);
				if (Array.isArray(res) && res.length > 0) {
					const first = res[0];
					if (first.execution !== void 0 && String(first.execution) !== String(config.execution)) continue;
				}
				return res;
			}
			return runData(args);
		},
		bugs: (() => {
			const scope = bugScopeOf(config);
			return scope === null ? async () => [] : () => runData([
				"bug",
				"list",
				`${scope.flag}=${scope.value}`,
				`--fields=${BUG_PANEL_FIELDS}`,
				...bugExtra,
				"--all"
			]);
		})()
	};
}
/** 聚合两次查询；单边失败时另一边仍返回，并透出首个错误信息。 */
async function overviewData(config, queries, profileInfo = readCurrentProfileInfo()) {
	const [tasks, bugs] = await Promise.allSettled([queries.tasks(), queries.bugs()]);
	const firstError = [tasks, bugs].map((r) => r.status === "rejected" ? r.reason.message : void 0).find((m) => m !== void 0);
	const rows = (r) => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [];
	return {
		tasks: rows(tasks),
		bugs: rows(bugs),
		config,
		...profileInfo ? {
			currentUser: {
				account: profileInfo.account,
				realname: profileInfo.realname
			},
			serverUrl: profileInfo.server
		} : {},
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
	if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(LOGIN_PATH);
	const dispose = webServer.register({
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
	return () => {
		try {
			dispose?.();
		} catch {}
		if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(LOGIN_PATH);
	};
}
function detectContentType(buf) {
	if (buf.length >= 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
	if (buf.length >= 3 && buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
	if (buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
	if (buf.length >= 4 && buf.subarray(0, 4).toString("hex") === "52494646") return "image/webp";
	return "application/octet-stream";
}
/**
* GET /__dsh-zentao__/file?id=<文件ID>：
* 图片流代理端点。使用当前已登录凭证向禅道拉取文件二进制并直吐浏览器，
* 解决浏览器同源保护、CORS 与鉴权导致 Bug 详情中图片无法展示的问题。
*/
function registerFileApi(ctx) {
	const webServer = ctx.webServer;
	if (webServer === void 0) return () => {};
	if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(FILE_PATH);
	const dispose = webServer.register({
		kind: "exact",
		path: FILE_PATH,
		handler: async (req, res) => {
			const url = req.url ?? "";
			const match = /[?&]id=(\d+)/.exec(url);
			if (!match || !match[1]) {
				sendJson(res, 400, { error: "缺少 id 查询参数" });
				return;
			}
			const fileId = match[1];
			const profile = readCurrentProfileInfo();
			if (!profile?.server || !profile.token) {
				sendJson(res, 401, { error: "禅道未登录" });
				return;
			}
			try {
				const downloadUrl = `${profile.server.replace(/\/+$/, "")}/api.php/v2/files/${fileId}/download`;
				const upstream = await fetch(downloadUrl, { headers: {
					Token: profile.token,
					Cookie: "tab=project; app=project"
				} });
				if (!upstream.ok) {
					sendJson(res, upstream.status, { error: `下载失败: HTTP ${upstream.status}` });
					return;
				}
				const buf = Buffer.from(await upstream.arrayBuffer());
				const contentType = detectContentType(buf);
				res.writeHead(200, {
					"content-type": contentType,
					"cache-control": "public, max-age=86400",
					"content-length": String(buf.length)
				});
				res.end(buf);
			} catch (err) {
				sendJson(res, 500, { error: err instanceof Error ? err.message : "图片拉取失败" });
			}
		}
	});
	return () => {
		try {
			dispose?.();
		} catch {}
		if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(FILE_PATH);
	};
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
/** 筛选参数白名单（字母数字与 = , _ -），防异常字符进入 CLI 参数。 */
const FILTER_PARAM_RE = /^[a-zA-Z0-9=,_-]{1,120}$/;
/**
* 解析面板筛选参数（taskBrowse/taskFilter/bugBrowse/bugFilter）。
* 返回 null 表示存在非法参数（调用方应 400）；全部缺省返回 {}。
*/
function panelFiltersOf(req) {
	const url = req.url ?? "";
	const out = {};
	for (const name of [
		"taskBrowse",
		"taskFilter",
		"bugBrowse",
		"bugFilter"
	]) {
		const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
		if (match === null || match[1] === void 0 || match[1] === "") continue;
		let value;
		try {
			value = decodeURIComponent(match[1]);
		} catch {
			return null;
		}
		if (!FILTER_PARAM_RE.test(value)) return null;
		out[name] = value;
	}
	return out;
}
/** 缓存键：工作区 + 筛选参数（不同筛选条件独立缓存）。 */
function cacheKeyOf(workspace, filters) {
	return [
		workspace,
		filters.taskBrowse ?? "",
		filters.taskFilter ?? "",
		filters.bugBrowse ?? "",
		filters.bugFilter ?? ""
	].join("|");
}
/**
* GET /__dsh-zentao__/overview?workspace=<工作区绝对路径>[&fresh=1]：
* 读该工作区的 .dsh-zentao.json，按配置拉取任务与 Bug。缓存按工作区分键
* （60s TTL + 并发去重）；fresh=1 强制刷新（登录后/手动刷新用）。
*/
function registerOverviewApi(ctx, deps = {}) {
	const webServer = ctx.webServer;
	if (webServer === void 0) return () => {};
	if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(OVERVIEW_PATH);
	const readConfig = deps.readConfig ?? readWorkspaceConfig;
	const cache = /* @__PURE__ */ new Map();
	const inflight = /* @__PURE__ */ new Map();
	const compute = async (workspace, filters) => {
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
		return overviewData(result.config, createQueries(result.config, deps.run, filters));
	};
	const dispose = webServer.register({
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
			const filters = panelFiltersOf(req);
			if (filters === null) {
				sendJson(res, 400, {
					tasks: [],
					bugs: [],
					error: "非法筛选参数（taskBrowse/taskFilter/bugBrowse/bugFilter 仅允许字母数字与 = , _ -）"
				});
				return;
			}
			try {
				const fresh = (req.url ?? "").includes("fresh=1");
				const key = cacheKeyOf(workspace, filters);
				if (!fresh) {
					const hit = cache.get(key);
					if (hit !== void 0 && Date.now() - hit.at < OVERVIEW_CACHE_TTL) {
						sendJson(res, 200, hit.data);
						return;
					}
				}
				let pending = inflight.get(key);
				if (pending === void 0) {
					pending = compute(workspace, filters).then((data) => {
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
	return () => {
		try {
			dispose?.();
		} catch {}
		if (webServer.exact && typeof webServer.exact.delete === "function") webServer.exact.delete(OVERVIEW_PATH);
	};
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
		registerLoginApi(ctx),
		registerFileApi(ctx)
	];
	return () => {
		for (const dispose of disposers.reverse()) dispose?.();
	};
}
//#endregion
export { apply, inject, name };
