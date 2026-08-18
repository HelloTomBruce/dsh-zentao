# dsh-zentao 插件实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建一个发布到 GitHub 的 dsh/Cordis 插件，让 dsh 会话通过一个 `zentao` 薄代理工具查询/操作禅道数据，并在 Web 客户端提供对话内表格卡片和侧栏底部原生面板。

**架构：** Node 侧注册 1 个 `zentao` 工具（child_process 调 `zentao` CLI，`--format=json` 解析）+ `/__dsh-zentao__/overview` 数据端点；Web 客户端注册 `tool.call.toolview` keyed seat（表格卡片）和 `sidebar.footer.action`（侧栏底部图标 → 弹出面板）。凭证完全由 CLI 内部管理，插件不接触凭证。

**技术栈：** TypeScript、tsdown（node ESM + client CJS closure-factory 双产物）、@deepseek-ai/dsh-tools（defineTool）、@deepseek-ai/dsh-host-webserver（webServer 服务）、react（客户端）、vitest（node 侧测试）。

**前置事实（已实测验证）：**
- CLI 已登录，服务端禅道 22.0 @ http://192.168.0.11/zentao
- `zentao <module> --format=json` 返回 `{"status":"success","data":[...],"pager":{...}}`；错误返回 `{"error":{"code":"2003","message":"..."}}`
- **task 列表必须 `--executionID=<id>`**（`--execution` 报 2003 缺少参数）；bug/story 列表用 `--product=<id>`
- `--filter` 与分页不兼容（pitfall），列表统一 `--recPerPage=200` 拉全量后程序过滤
- `bug resolve` 需 4 字段：resolution + assignedTo + resolvedBuild + comment
- 本机真实数据：products id=2.., executions id=168/169, tasks id=15317..（execution 168 下 5 条）

---

### 任务 1：项目骨架（构建配置 + 空壳）

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`tsdown.config.ts`
- 创建：`cordis.patch.yml`
- 创建：`.gitignore`
- 创建：`src/index.ts`（空壳 apply）
- 创建：`src/client/index.ts`（空壳 apply）

- [ ] **步骤 1：package.json**

```json
{
  "name": "dsh-zentao",
  "version": "0.1.0",
  "description": "DSH 插件：1 个 zentao 薄代理工具（查询/操作禅道数据）+ 对话内表格卡片 + 侧栏底部面板。凭证由 zentao CLI 内部管理，插件不接触凭证。",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/client.js",
    "lib/types/**/*.d.ts",
    "cordis.patch.yml",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit --pretty false",
    "test": "vitest run",
    "verify": "npm run typecheck && npm run test && npm run build"
  },
  "keywords": ["dsh", "dsh-plugin", "deepseek-harness", "zentao", "禅道", "project-management"],
  "license": "MIT",
  "engines": { "node": ">=22" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "react": "^18.3.0",
    "tsdown": "^0.22.0",
    "typescript": "^5.9.2",
    "vitest": "^3.0.0"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-tool",
        "@deepseek-ai/dsh-client-ui-slots"
      ],
      "platform": "web"
    }
  }
}
```

- [ ] **步骤 2：tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "lib/types",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": [],
    "baseUrl": ".",
    "paths": {
      "@deepseek-ai/cordis": ["../deepseek-harness/vendor/cordis/lib/types/index.d.ts"],
      "@deepseek-ai/dsh-tools": ["../deepseek-harness/packages/core/tools/lib/types/index.d.ts"],
      "@deepseek-ai/dsh-system-prompt": ["../deepseek-harness/packages/core/system-prompt/lib/types/index.d.ts"],
      "@deepseek-ai/dsh-host-webserver": ["../deepseek-harness/packages/host/webserver/lib/types/index.d.ts"],
      "@deepseek-ai/dsh-client-runtime/client": ["../deepseek-harness/packages/client/runtime/lib/types/client/index.d.ts"],
      "@deepseek-ai/dsh-client-ui-conversation/client": ["../deepseek-harness/packages/client/ui-conversation/lib/types/client/index.d.ts"],
      "@deepseek-ai/dsh-client-ui-tool/client": ["../deepseek-harness/packages/client/ui-tool/lib/types/client/index.d.ts"],
      "@deepseek-ai/dsh-client-ui-slots": ["../deepseek-harness/packages/client/ui-slots/lib/types/index.d.ts"],
      "react": ["./node_modules/@types/react"],
      "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]
    }
  },
  "include": ["src"]
}
```

> 注意：若本机 `deepseek-harness` 不在 `../deepseek-harness`，用 `pnpm approve-builds esbuild`（或 node_modules 里的 tsdown）后以实际相对路径为准；`dsh` 各包的类型产物需已 build（`lib/types/**/*.d.ts` 存在）。

- [ ] **步骤 3：tsdown.config.ts**（node ESM + client CJS closure-factory 双产物）

```ts
import { defineConfig, type UserConfig } from "tsdown";

const CLIENT_EXTERNALS = ["react", "react/jsx-runtime", "react-dom", "react-dom/client"];

const node: UserConfig = {
  name: "dsh-zentao",
  entry: { index: "lib/types/index.js" },
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "es2022",
  fixedExtension: false,
  dts: false,
  clean: false,
  external: [/^@deepseek-ai\//],
};

const client: UserConfig = {
  name: "dsh-zentao/client",
  entry: { client: "lib/types/client/index.js" },
  outDir: "lib",
  format: "cjs",
  platform: "browser",
  dts: false,
  sourcemap: true,
  minify: true,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: "client.js",
    banner: `window.__ModuleLoader__.load({ id: "dsh-zentao", factory: (require) => {`,
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
};

export default defineConfig([node, client]);
```

- [ ] **步骤 4：cordis.patch.yml**

```yaml
# dsh-zentao bundle layer. Installed below every profile patch, so users may
# override or remove these rows by id from their own cordis.patch.yml.
# `name` resolves through Node from the installed package (linked into the
# profile by `dsh plugin add`); the client half is discovered from the
# package.json `dsh.client` manifest.
- insert:
    - id: zentao
      name: 'dsh-zentao'
```

- [ ] **步骤 5：.gitignore**

```
node_modules/
lib/
*.tsbuildinfo
```

- [ ] **步骤 6：src/index.ts 空壳**

```ts
import type { Context } from "@deepseek-ai/cordis";

export const name = "zentao";
export const inject = ["tools", "webServer"];

export function apply(ctx: Context): void {
  // Task 3 注册 zentao 工具；Task 4 注册 /__dsh-zentao__/overview 端点。
}
```

- [ ] **步骤 7：src/client/index.ts 空壳**

```ts
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";

export const inject = ["slots"];

export function apply(ctx: ClientContext): void {
  // Task 5 注册 tool.call.toolview 表格卡；Task 6 注册 sidebar.footer.action 面板。
}
```

- [ ] **步骤 8：安装依赖并验证空壳 build**

运行：`npm install`（若 pnpm 环境用 `pnpm install && pnpm approve-builds esbuild`）
预期：`npm run build` 成功产出 `lib/index.js`、`lib/client.js`

- [ ] **步骤 9：Commit**

```bash
git add -A
git commit -m "feat: dsh-zentao 项目骨架（构建配置 + 空壳）"
```

---

### 任务 2：CLI 调用层（execFile + JSON 解析 + 错误映射）

**文件：**
- 创建：`src/lib/cli.ts`
- 测试：`tests/cli.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/cli.test.ts
import { describe, it, expect, vi } from "vitest";
import { runZentao, cliError } from "../src/lib/cli.js";

// 注入 fake execFile：runZentao 接受可注入的 exec，便于测试
function fakeExec(stdout: string, code = 0) {
  return vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, so: string) => void) => {
    if (code !== 0) {
      cb(new Error(`exit ${code}`), stdout);
    } else {
      cb(null, stdout);
    }
  });
}

describe("runZentao", () => {
  it("拼接 CLI 参数并追加 --format=json", async () => {
    const exec = fakeExec('{"status":"success","data":[{"id":1}]}');
    const result = await runZentao(["bug", "--product=2", "--recPerPage=200"], exec as never);
    expect(exec).toHaveBeenCalledWith(
      "zentao",
      ["bug", "--product=2", "--recPerPage=200", "--format=json"],
      expect.any(Function),
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it("透传原始对象当列表无 data 时（详情返回对象）", async () => {
    const exec = fakeExec('{"status":"success","data":{"id":42,"title":"x"}}');
    const result = await runZentao(["bug", "42"], exec as never);
    expect(result).toEqual({ id: 42, title: "x" });
  });

  it("CLI 错误码映射为 cliError（带 code）", async () => {
    const exec = fakeExec('{"error":{"code":"2003","message":"缺少必要参数"}}', 1);
    await expect(runZentao(["task", "--execution=1"], exec as never)).rejects.toMatchObject({
      code: "2003",
      message: expect.stringContaining("缺少必要参数"),
    });
  });

  it("CLI 不存在（ENOENT）映射为安装引导错误", async () => {
    const exec = vi.fn((_cmd: string, _args: string[], cb: (err: Error) => void) => {
      const e = new Error("spawn zentao ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      cb(e);
    });
    await expect(runZentao(["bug"], exec as never)).rejects.toMatchObject({
      code: "ENOENT",
      message: expect.stringContaining("npm i -g zentao-cli"),
    });
  });

  it("exit code 非 0 且 stdout 非 JSON 时报 CLI 错误", async () => {
    const exec = fakeExec("some random error text", 1);
    await expect(runZentao(["bug"], exec as never)).rejects.toThrow(/zentao/);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/cli.test.ts`
预期：FAIL，`../src/lib/cli.js` 模块不存在

- [ ] **步骤 3：实现 src/lib/cli.ts**

```ts
/**
 * zentao CLI 调用层。所有禅道数据都通过 CLI 子进程获取，凭证由 CLI 内部
 * 管理（~/.config/zentao/zentao.json），本层不读取、不接触任何凭证。
 */

import { execFile } from "node:child_process";

/** CLI 返回的结构化错误（code 来自 CLI 错误码或 ENOENT）。 */
export interface CliError extends Error {
  code: string;
  raw?: string;
}

function cliErrorOf(code: string, message: string, raw?: string): CliError {
  const err = new Error(message) as CliError;
  err.code = code;
  if (raw !== undefined) err.raw = raw;
  return err;
}

/** execFile 回调签名（便于测试注入）。 */
type ExecFn = (
  cmd: string,
  args: string[],
  cb: (error: Error | null, stdout: string) => void,
) => void;

const defaultExec: ExecFn = (cmd, args, cb) => {
  execFile(cmd, args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
    cb(error, String(stdout));
  });
};

/** 解析 CLI JSON 输出；错误统一映射为 CliError。 */
function parseOutput(stdout: string, cliFailed: boolean): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw cliErrorOf(
      "E5001",
      cliFailed
        ? `zentao CLI 执行失败：${stdout.slice(0, 200)}`
        : `zentao CLI 输出无法解析：${stdout.slice(0, 200)}`,
      stdout,
    );
  }
  const obj = parsed as { status?: unknown; error?: { code?: unknown; message?: unknown }; data?: unknown };
  if (obj?.error !== undefined) {
    const code = String(obj.error.code ?? "E5001");
    const message = String(obj.error.message ?? "zentao 请求失败");
    throw cliErrorOf(code, `zentao: ${message}`);
  }
  if (cliFailed) {
    throw cliErrorOf("E5001", `zentao CLI 退出码非 0：${stdout.slice(0, 200)}`, stdout);
  }
  return obj?.data;
}

/**
 * 执行 zentao CLI。args 不含 --format=json（自动追加）。
 * @returns CLI JSON 输出的 data 字段（列表为数组，详情为对象）。
 */
export async function runZentao(args: string[], exec: ExecFn = defaultExec): Promise<unknown> {
  const fullArgs = [...args, "--format=json"];
  return new Promise((resolve, reject) => {
    exec("zentao", fullArgs, (error, stdout) => {
      if (error !== null) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          reject(cliErrorOf("ENOENT", "未找到 zentao CLI，请先安装：npm i -g zentao-cli"));
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
export function asCliError(error: unknown): CliError {
  if (error instanceof Error && "code" in error) return error as CliError;
  return cliErrorOf("E5001", error instanceof Error ? error.message : String(error));
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/cli.test.ts`
预期：PASS（5 个用例）

- [ ] **步骤 5：Commit**

```bash
git add src/lib/cli.ts tests/cli.test.ts
git commit -m "feat: zentao CLI 调用层（execFile + JSON 解析 + 错误映射）"
```

---

### 任务 3：`zentao` 工具定义（模块/动作白名单 + 参数校验 + 注册）

**文件：**
- 创建：`src/schema.ts`
- 创建：`src/tools.ts`
- 修改：`src/index.ts`（注册工具）
- 测试：`tests/schema.test.ts`
- 测试：`tests/tools.test.ts`

- [ ] **步骤 1：编写失败的测试（schema 校验）**

```ts
// tests/schema.test.ts
import { describe, it, expect } from "vitest";
import { buildCliArgs, MODULE_INFO, type ZentaoArgs } from "../src/schema.js";

describe("buildCliArgs", () => {
  it("list：拼接 module + 范围参数 + recPerPage=200", () => {
    const args: ZentaoArgs = { module: "bug", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["bug", "--product=2", "--recPerPage=200"]);
  });

  it("list 用 executionID（task 模块强制 --executionID）", () => {
    const args: ZentaoArgs = { module: "task", action: "list", executionID: 168 };
    expect(buildCliArgs(args)).toEqual(["task", "--executionID=168", "--recPerPage=200"]);
  });

  it("get：module + id", () => {
    const args: ZentaoArgs = { module: "bug", action: "get", id: 3395 };
    expect(buildCliArgs(args)).toEqual(["bug", "3395"]);
  });

  it("create：module create + 字段参数", () => {
    const args: ZentaoArgs = { module: "bug", action: "create", fields: { title: "t", severity: 2 } };
    expect(buildCliArgs(args)).toEqual(["bug", "create", "--title=t", "--severity=2"]);
  });

  it("update：module update id + 字段", () => {
    const args: ZentaoArgs = { module: "bug", action: "update", id: 1, fields: { status: "active" } };
    expect(buildCliArgs(args)).toEqual(["bug", "update", "1", "--status=active"]);
  });

  it("resolve 缺 resolvedBuild 时报错（4 字段必填）", () => {
    const args: ZentaoArgs = {
      module: "bug", action: "resolve", id: 1,
      fields: { resolution: "fixed", assignedTo: "admin", comment: "ok" },
    };
    expect(() => buildCliArgs(args)).toThrow(/resolvedBuild/);
  });

  it("未知 module 报错", () => {
    expect(() => buildCliArgs({ module: "nope", action: "list" } as never)).toThrow(/module/);
  });

  it("未知 action 报错", () => {
    expect(() => buildCliArgs({ module: "bug", action: "nope" } as never)).toThrow(/action/);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/schema.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：实现 src/schema.ts**

```ts
/**
 * zentao 工具的模块/动作白名单与 CLI 参数构造。所有列表统一
 * --recPerPage=200 拉全量（--filter 与分页不兼容的 pitfall 规避），
 * 程序侧再按需过滤。
 */

export type ZentaoModule =
  | "program" | "product" | "project" | "execution"
  | "story" | "epic" | "requirement"
  | "bug" | "task" | "testcase" | "testtask"
  | "productplan" | "build" | "release"
  | "feedback" | "ticket" | "system" | "user" | "file";

export type ZentaoAction = "list" | "get" | "create" | "update" | "delete" | "activate" | "close" | "resolve" | "start" | "finish" | "change";

interface ModuleInfo {
  /** 中文名（错误提示用）。 */
  readonly label: string;
  /** 列表时必须提供的范围参数名（无则 null）。 */
  readonly scopeFlag: string | null;
  /** 允许的动作集合。 */
  readonly actions: ReadonlySet<ZentaoAction>;
}

const set = (...xs: ZentaoAction[]): ReadonlySet<ZentaoAction> => new Set(xs);

export const MODULE_INFO: Record<ZentaoModule, ModuleInfo> = {
  program:     { label: "项目集", scopeFlag: null, actions: set("list", "get", "create", "update", "delete") },
  product:     { label: "产品",   scopeFlag: null, actions: set("list", "get", "create", "update", "delete") },
  project:     { label: "项目",   scopeFlag: null, actions: set("list", "get", "create", "update", "delete") },
  execution:   { label: "执行",   scopeFlag: "--project", actions: set("list", "get", "create", "update", "delete") },
  story:       { label: "需求",   scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  epic:        { label: "业务需求", scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  requirement: { label: "用户需求", scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close", "change") },
  bug:         { label: "Bug",    scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close", "resolve") },
  task:        { label: "任务",   scopeFlag: "--executionID", actions: set("list", "get", "create", "update", "delete", "activate", "close", "start", "finish") },
  testcase:    { label: "测试用例", scopeFlag: null, actions: set("list", "get", "create", "update", "delete") },
  testtask:    { label: "测试单", scopeFlag: "--product", actions: set("create", "update", "delete") },
  productplan: { label: "产品计划", scopeFlag: "--product", actions: set("create", "update", "delete") },
  build:       { label: "版本",   scopeFlag: "--project", actions: set("create", "update", "delete") },
  release:     { label: "发布",   scopeFlag: "--product", actions: set("create", "update", "delete") },
  feedback:    { label: "反馈",   scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  ticket:      { label: "工单",   scopeFlag: "--product", actions: set("list", "get", "create", "update", "delete", "activate", "close") },
  system:      { label: "应用",   scopeFlag: "--product", actions: set("list", "create", "update") },
  user:        { label: "用户",   scopeFlag: null, actions: set("list", "get", "create", "update", "delete") },
  file:        { label: "附件",   scopeFlag: null, actions: set("update", "delete") },
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

  if (action === "list") {
    const scope = info.scopeFlag;
    if (scope !== null) {
      let value: number | undefined;
      if (scope === "--product") value = args.product;
      else if (scope === "--project") value = args.project;
      else if (scope === "--executionID") value = args.executionID;
      if (value === undefined) {
        throw new Error(`${info.label}(${module}) 列表需要 ${scope.replace(/^--/, "")} 参数`);
      }
      return [module, `${scope}=${value}`, "--recPerPage=200"];
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
  if (id === undefined) throw new Error(`${info.label}(${module}) ${action} 需要 id`);
  return [module, action, String(id), ...flagArgs(fields)];
}

function flagArgs(fields: Record<string, string | number | boolean> | undefined): string[] {
  if (fields === undefined) return [];
  return Object.entries(fields).map(([k, v]) => `--${k}=${String(v)}`);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/schema.test.ts`
预期：PASS（8 个用例）

- [ ] **步骤 5：编写工具注册测试（mock ctx）**

```ts
// tests/tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { apply } from "../src/index.js";
import { buildCliArgs } from "../src/schema.js";

function mockCtx() {
  const registered: unknown[] = [];
  const sections: unknown[] = [];
  return {
    registered,
    sections,
    ctx: {
      tools: {
        register: (def: unknown) => {
          registered.push(def);
          return () => {};
        },
      },
      systemPrompt: {
        section: (s: unknown) => { sections.push(s); },
      },
      webServer: {
        register: (route: unknown) => {
          registered.push(route);
          return () => {};
        },
      },
      effect: (fn: () => unknown) => fn(),
    },
  };
}

describe("apply", () => {
  it("注册 1 个 zentao 工具 + systemPrompt section", () => {
    const { registered, sections, ctx } = mockCtx();
    apply(ctx as never);
    const tool = registered.find((d) => (d as { name?: string }).name === "zentao");
    expect(tool).toBeDefined();
    const def = tool as { parameters?: Record<string, unknown>; execute?: (a: unknown) => Promise<unknown> };
    expect(def.parameters?.module).toBeDefined();
    expect(def.parameters?.action).toBeDefined();
    expect(def.execute).toBeTypeOf("function");
    expect(sections.length).toBe(1);
  });

  it("execute 走 buildCliArgs + 返回结构化结果", async () => {
    const { ctx } = mockCtx();
    apply(ctx as never);
    const tool = ctx.registered.find((d) => (d as { name?: string }).name === "zentao") as {
      execute: (a: unknown) => Promise<unknown>;
    };
    // 工具 execute 内部会用真实 runZentao —— 这里只验证入参→错误路径可抛中文提示
    await expect(tool.execute({ module: "bug", action: "resolve", id: 1 })).rejects.toThrow(/resolvedBuild/);
  });
});
```

- [ ] **步骤 6：运行测试验证失败**

运行：`npx vitest run tests/tools.test.ts`
预期：FAIL，`apply` 未注册工具（空壳）

- [ ] **步骤 7：实现 src/tools.ts + 修改 src/index.ts**

```ts
// src/tools.ts
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-system-prompt";
import { runZentao } from "./lib/cli.ts";
import { buildCliArgs, MODULES, type ZentaoArgs } from "./schema.ts";

const DESCRIPTION = `Query or operate ZenTao (禅道) project data through the installed \`zentao\` CLI.

Usage: pick a \`module\` (story/bug/task/project/execution/product/...) and an \`action\`:
- list: fetch rows (pass the module's scope param, e.g. bug -> product, task -> executionID)
- get <id>: fetch one object
- create: pass \`fields\` (e.g. title, assignedTo, pri)
- update <id>: pass changed \`fields\` only (CLI backfills the rest)
- delete <id>
- status actions per module: bug -> activate/close/resolve; task -> activate/close/start/finish; story -> activate/close/change

Notes:
- bug resolve requires resolution + assignedTo + resolvedBuild + comment (server-enforced).
- Lists return full data (up to 200 rows) — filter client-side via the \`status\` / \`assignedTo\` fields in the JSON.
- Requires the CLI installed and logged in: npm i -g zentao-cli && zentao login`;

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
    description: "产品 ID（列表范围参数，story/bug/release/feedback/ticket 等需要）。",
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
    additionalProperties: { type: "json" },
  },
} as const;

export function applyTools(ctx: Context): void {
  ctx.systemPrompt.section({
    name: "tool:zentao",
    order: 130,
    text: "Use the zentao tool to query or operate ZenTao (禅道) data — bug/story/task/project lists, details, creates, updates, and status transitions (resolve/close/activate/start/finish). For lists pass the module's scope param (bug/story/release -> product, task -> executionID, execution/build -> project); results come back as JSON arrays (200-row cap) — filter client-side. bug resolve needs resolution + assignedTo + resolvedBuild + comment. Requires zentao CLI installed and logged in.",
  });

  ctx.tools.register(
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
        presentationMeta: (args, value) => ({
          module: value.module,
          action: value.action,
          count: value.count,
        }),
      },
      isConcurrencySafe: () => false,
      async execute(args) {
        const zargs = args as ZentaoArgs;
        const data = await runZentao(buildCliArgs(zargs));
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
  );
}
```

```ts
// src/index.ts（完整）
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { applyTools } from "./tools.ts";
import { registerOverviewApi } from "./api.ts";

export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void {
  ctx.effect(() => applyTools(ctx), "dsh-zentao: tools");
  ctx.effect(() => registerOverviewApi(ctx), "dsh-zentao: overview api");
}
```

> 注意：`src/api.ts` 在任务 4 实现；先创建 `registerOverviewApi` 空函数占位（`export function registerOverviewApi(_ctx: Context): void {}`），任务 4 填充。为避免占位符禁令，可将该注册行放到任务 4 一并完成——**推荐：本任务只注册工具，index.ts 先只调用 applyTools，任务 4 再补 api 行。**

- [ ] **步骤 8：运行测试验证通过**

运行：`npx vitest run tests/schema.test.ts tests/tools.test.ts`
预期：PASS

- [ ] **步骤 9：Commit**

```bash
git add src/schema.ts src/tools.ts src/index.ts tests/schema.test.ts tests/tools.test.ts
git commit -m "feat: zentao 工具（模块/动作白名单 + 参数构造 + 注册）"
```

---

### 任务 4：`/__dsh-zentao__/overview` 数据端点（喂面板）

**文件：**
- 创建：`src/api.ts`
- 修改：`src/index.ts`（补 registerOverviewApi 调用）
- 测试：`tests/api.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/api.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerOverviewApi, overviewData } from "../src/api.js";

describe("overviewData", () => {
  it("聚合我的任务 / 我的 Bug / 进行中项目（注入查询函数）", async () => {
    const queries = {
      tasks: vi.fn(async () => [
        { id: 1, name: "任务A", status: "wait", assignedTo: "me" },
        { id: 2, name: "任务B", status: "doing", assignedTo: "other" },
      ]),
      bugs: vi.fn(async () => [{ id: 1, title: "Bug1", status: "active" }]),
      projects: vi.fn(async () => [{ id: 87, name: "内部项目", status: "doing" }]),
    };
    const data = await overviewData(queries as never);
    expect(queries.tasks).toHaveBeenCalled();
    expect(data.myTasks).toHaveLength(2);
    expect(data.myBugs).toEqual([{ id: 1, title: "Bug1", status: "active" }]);
    expect(data.activeProjects).toEqual([{ id: 87, name: "内部项目", status: "doing" }]);
  });

  it("查询失败时返回 error 结构而非抛错", async () => {
    const queries = {
      tasks: vi.fn(async () => { throw new Error("未登录"); }),
      bugs: vi.fn(async () => []),
      projects: vi.fn(async () => []),
    };
    const data = await overviewData(queries as never);
    expect(data.error).toMatch(/未登录/);
  });
});

describe("registerOverviewApi", () => {
  it("注册 /__dsh-zentao__/overview 精确路由", () => {
    const registered: unknown[] = [];
    const ctx = {
      webServer: { register: (r: unknown) => { registered.push(r); return () => {}; } },
      effect: (fn: () => unknown) => fn(),
    };
    registerOverviewApi(ctx as never);
    const route = registered[0] as { kind?: string; path?: string };
    expect(route.kind).toBe("exact");
    expect(route.path).toBe("/__dsh-zentao__/overview");
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/api.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：实现 src/api.ts**

```ts
/**
 * /__dsh-zentao__/overview 数据端点：聚合"我的任务 / 我的 Bug / 进行中
 * 项目"三个视图供客户端面板 fetch。数据经 CLI 子进程获取（凭证由 CLI
 * 内部管理）。同源路由，不暴露任何凭证。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { runZentao, asCliError } from "./lib/cli.ts";

export const OVERVIEW_PATH = "/__dsh-zentao__/overview";

export interface OverviewRow {
  id: string | number;
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface OverviewData {
  myTasks: OverviewRow[];
  myBugs: OverviewRow[];
  activeProjects: OverviewRow[];
  error?: string;
}

interface Queries {
  tasks: () => Promise<unknown>;
  bugs: () => Promise<unknown>;
  projects: () => Promise<unknown>;
}

const defaultQueries: Queries = {
  // task 列表需要 executionID —— 无法全局枚举，退化为按产品/执行探查：
  // 真实实现见 overviewData 内的 fallback 逻辑（见下方注释）。
  tasks: async () => [],
  bugs: async () => [],
  projects: async () => [],
};

/**
 * 聚合三次查询。注入 queries 便于测试；默认实现：
 * - bugs: `bug --product=<p>` 逐个产品拉取（本项目产品 id 2..22）
 * - projects: `project --recPerPage=200` 后按 status=doing 过滤
 * - tasks: 无全局入口，返回空（CLI 局限），面板展示"任务视图需指定执行"
 */
export async function overviewData(queries: Queries = defaultQueries): Promise<OverviewData> {
  const [tasks, bugs, projects] = await Promise.allSettled([
    queries.tasks(),
    queries.bugs(),
    queries.projects(),
  ]);
  const firstError = [tasks, bugs, projects]
    .map((r) => (r.status === "rejected" ? (r.reason as Error).message : undefined))
    .find((m) => m !== undefined);
  return {
    myTasks: tasks.status === "fulfilled" && Array.isArray(tasks.value) ? tasks.value : [],
    myBugs: bugs.status === "fulfilled" && Array.isArray(bugs.value) ? bugs.value : [],
    activeProjects:
      projects.status === "fulfilled" && Array.isArray(projects.value)
        ? projects.value.filter((p) => (p as { status?: string }).status === "doing")
        : [],
    ...(firstError !== undefined ? { error: firstError } : {}),
  };
}

/** 默认查询实现：projects 全量过滤；bugs 遍历产品（可配置产品列表见下方）。 */
export function createDefaultQueries(productIds: readonly number[]): Queries {
  return {
    tasks: async () => [],
    bugs: async () => {
      const rows: unknown[] = [];
      for (const pid of productIds) {
        const data = await runZentao(["bug", `--product=${pid}`, "--recPerPage=200"]);
        if (Array.isArray(data)) rows.push(...data);
      }
      return rows;
    },
    projects: async () => runZentao(["project", "--recPerPage=200"]),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function registerOverviewApi(ctx: Context): void {
  const webServer = ctx.webServer;
  if (webServer === undefined) return;
  // 产品 ID 列表：先查一次 product 列表拿到全部产品，再逐产品拉 Bug。
  const route = webServer.register({
    kind: "exact",
    path: OVERVIEW_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if ((req.method ?? "GET") !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      try {
        const products = await runZentao(["product", "--recPerPage=200"]);
        const ids = Array.isArray(products)
          ? products.map((p) => Number((p as { id?: unknown }).id)).filter((n) => Number.isFinite(n))
          : [];
        const data = await overviewData(createDefaultQueries(ids));
        sendJson(res, 200, data);
      } catch (error) {
        sendJson(res, 200, { myTasks: [], myBugs: [], activeProjects: [], error: asCliError(error).message });
      }
    },
  });
  ctx.effect(() => route, "dsh-zentao: overview route");
}
```

> **已知 CLI 局限（写入 README）：** task 列表必须 `--executionID`，禅道无"我的任务"全局入口；面板"我的任务"默认展示空 + 提示。若用户希望按执行聚合，可在插件配置增加 `executionIds` 列表（本计划范围外，见设计文档"范围外"）。

- [ ] **步骤 4：修改 src/index.ts 补 api 注册**

```ts
// src/index.ts（完整）
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { applyTools } from "./tools.ts";
import { registerOverviewApi } from "./api.ts";

export const name = "zentao";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void {
  ctx.effect(() => applyTools(ctx), "dsh-zentao: tools");
  ctx.effect(() => registerOverviewApi(ctx), "dsh-zentao: overview api");
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npx vitest run tests/api.test.ts`
预期：PASS（3 个用例）

- [ ] **步骤 6：Commit**

```bash
git add src/api.ts src/index.ts tests/api.test.ts
git commit -m "feat: /__dsh-zentao__/overview 数据端点（我的任务/Bug/进行中项目）"
```

---

### 任务 5：客户端表格工具卡（tool.call.toolview）

**文件：**
- 创建：`src/client/table.tsx`
- 创建：`src/client/toolview.tsx`
- 修改：`src/client/index.ts`
- 测试：`tests/client/table.test.ts`（纯函数部分）

- [ ] **步骤 1：编写失败的测试（表格数据解析纯函数）**

```ts
// tests/client/table.test.ts
import { describe, it, expect } from "vitest";
import { rowsToColumns, extractData, type ToolResultPayload } from "../src/client/table.js";

describe("extractData", () => {
  it("从工具 result 文本提取 JSON payload", () => {
    const payload: ToolResultPayload = { module: "bug", action: "list", data: [{ id: 1, title: "x" }], count: 1 };
    expect(extractData(JSON.stringify(payload))).toEqual(payload);
  });

  it("非 JSON 返回 null", () => {
    expect(extractData("not json")).toBeNull();
  });
});

describe("rowsToColumns", () => {
  it("把行数组转成列定义（key/label/type）", () => {
    const cols = rowsToColumns([{ id: 1, title: "x", status: "active" }]);
    expect(cols.map((c) => c.key)).toEqual(["id", "title", "status"]);
  });

  it("空数组返回空列", () => {
    expect(rowsToColumns([])).toEqual([]);
  });

  it("对象（详情）也转成两列 key/value", () => {
    const cols = rowsToColumns({ id: 1, title: "x" } as never);
    expect(cols.length).toBe(2);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/client/table.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：实现 src/client/table.tsx（纯函数 + 表格组件）**

```tsx
/**
 * zentao 工具卡的表格渲染：从工具 result 的文本 payload（JSON）重建列，
 * 渲染为自适应表格。live 与 replay 都从持久化的 tool/call + tool/result
 * 事件恢复（工具输出以 JSON 文本落盘），无自定义 session 事件。
 */

export interface ToolResultPayload {
  module: string;
  action: string;
  data: unknown;
  count?: number;
}

/** 从工具 result 文本提取 JSON payload；失败返回 null（降级为纯文本）。 */
export function extractData(text: string): ToolResultPayload | null {
  try {
    const parsed = JSON.parse(text) as ToolResultPayload;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ColumnDef {
  key: string;
  label: string;
  type: "id" | "status" | "text";
}

const STATUS_LABELS: Record<string, string> = {
  active: "激活", doing: "进行中", wait: "待开始", closed: "已关闭",
  resolved: "已解决", done: "已完成", pause: "已暂停", cancel: "已取消",
};

/** 行数组 → 列定义；对象 → key/value 两列。 */
export function rowsToColumns(data: unknown): ColumnDef[] {
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first !== "object" || first === null) return [];
    const keys = Object.keys(first as Record<string, unknown>).slice(0, 8);
    return keys.map((key) => ({
      key,
      label: key,
      type: key === "id" ? ("id" as const) : key === "status" ? ("status" as const) : ("text" as const),
    }));
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    return Object.keys(obj).slice(0, 12).map((key) => ({
      key, label: key, type: "text" as const,
    }));
  }
  return [];
}

/** 单元格取值（对象取 key；数组行内取 key）。 */
export function cellValue(row: unknown, key: string): unknown {
  if (typeof row !== "object" || row === null) return row;
  return (row as Record<string, unknown>)[key];
}

/** 状态徽标文字（未知状态原样显示）。 */
export function statusLabel(status: unknown): string {
  const s = String(status);
  return STATUS_LABELS[s] ?? s;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/client/table.test.ts`
预期：PASS

- [ ] **步骤 5：实现 src/client/toolview.tsx（工具卡组件）**

```tsx
/**
 * zentao 工具卡：从 tool/result 的文本 content 提取 JSON payload，列表渲染
 * 为表格，详情渲染为键值列表。解析失败降级为纯文本。
 */
import { useMemo } from "react";
import { createElement } from "react";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import { extractData, rowsToColumns, cellValue, statusLabel, type ColumnDef } from "./table.tsx";

function cellStyle(kind: ColumnDef["type"]): Record<string, string> {
  if (kind === "id") return { color: "var(--dsh-text-secondary, #6b7280)", fontVariantNumeric: "tabular-nums" };
  if (kind === "status") return { fontWeight: "600" };
  return {};
}

function TableView({ payload }: { payload: Extract<ToolResultPayload, { data: unknown[] }> }) {
  const cols = useMemo(() => rowsToColumns(payload.data), [payload.data]);
  if (cols.length === 0) {
    return createElement("div", { style: emptyStyle }, "（空列表）");
  }
  return createElement(
    "div",
    { style: { overflowX: "auto", margin: "8px 0" } },
    createElement(
      "table",
      { style: tableStyle },
      createElement(
        "thead",
        null,
        createElement("tr", null, ...cols.map((c) =>
          createElement("th", { key: c.key, style: thStyle }, c.label))),
      ),
      createElement(
        "tbody",
        null,
        ...(payload.data as unknown[]).map((row, i) =>
          createElement("tr", { key: i }, ...cols.map((c) =>
            createElement("td", { key: c.key, style: tdStyle }, renderCell(cellValue(row, c.key), c.type))))),
      ),
    ),
  );
}

function renderCell(value: unknown, type: ColumnDef["type"]): unknown {
  if (value === null || value === undefined) return "—";
  if (type === "status") return statusLabel(value);
  if (type === "text" && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailView({ payload }: { payload: Extract<ToolResultPayload, { data: object }> }) {
  const cols = rowsToColumns(payload.data);
  return createElement(
    "div",
    { style: { margin: "8px 0", border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "8px", overflow: "hidden" } },
    ...cols.map((c) =>
      createElement("div", { key: c.key, style: detailRowStyle },
        createElement("span", { style: detailKeyStyle }, c.label),
        createElement("span", { style: detailValueStyle }, renderCell(cellValue(payload.data, c.key), c.type)))),
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: "13px",
  border: "1px solid var(--dsh-border, #e3e6ea)", borderRadius: "8px",
};
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "6px 10px", fontWeight: "600",
  borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
  color: "var(--dsh-text-secondary, #6b7280)", fontSize: "12px", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px", borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
  maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const emptyStyle: React.CSSProperties = {
  margin: "8px 0", padding: "12px", color: "var(--dsh-text-secondary, #6b7280)", fontSize: "13px",
  border: "1px dashed var(--dsh-border, #e3e6ea)", borderRadius: "8px", textAlign: "center",
};
const detailRowStyle: React.CSSProperties = {
  display: "flex", gap: "12px", padding: "6px 10px",
  borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
};
const detailKeyStyle: React.CSSProperties = {
  minWidth: "120px", color: "var(--dsh-text-secondary, #6b7280)", fontWeight: "600", fontSize: "12px",
};
const detailValueStyle: React.CSSProperties = { flex: "1", wordBreak: "break-all", fontSize: "13px" };

/** 工具卡主组件：提取 payload → 表格/详情/降级。 */
export function ZentaoToolView({ block }: ToolCallViewProps) {
  const text = useMemo(() => {
    // block 为 settled ToolResultNode：content 里第一个 text block 是 render 输出
    const content = (block as { content?: readonly { type?: string; text?: string }[] }).content;
    if (!Array.isArray(content)) return undefined;
    const t = content.find((b) => b.type === "text" && typeof b.text === "string");
    return t?.text;
  }, [block]);

  const payload = useMemo(() => (text === undefined ? null : extractData(text)), [text]);

  if (payload === null) {
    return createElement("div", { style: emptyStyle }, text ?? "zentao 调用结果不可用（超出窗口）");
  }
  if (Array.isArray(payload.data)) {
    return createElement(TableView, { payload: payload as Extract<ToolResultPayload, { data: unknown[] }> });
  }
  if (typeof payload.data === "object" && payload.data !== null) {
    return createElement(DetailView, { payload: payload as Extract<ToolResultPayload, { data: object }> });
  }
  return createElement("div", { style: emptyStyle }, String(payload.data));
}
```

> 注意：`ToolCallViewProps` 在 dsh 0.2 的 `PropsRuntime<'tool.call.toolview'>` 形态可能不含 `block`（owner 侧才有）；实现时以 `lib/types` 实际导出为准——若 `ToolCallViewProps` 无数据，改从 `useRuntime`/owner props 读取 `block`（见 ui-tool 的 `ToolCallOwnerProps.block`）。类型以 `@deepseek-ai/dsh-client-ui-tool/client` 的 d.ts 为准，编译不过就按 d.ts 调整读取路径。

- [ ] **步骤 6：修改 src/client/index.ts 注册工具卡**

```ts
// src/client/index.ts
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { ZentaoToolView } from "./toolview.tsx";

export const inject = ["slots"];

export function apply(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "zentao",
  }, ZentaoToolView));
}
```

- [ ] **步骤 7：运行 typecheck + 测试**

运行：`npm run typecheck && npx vitest run tests/client/table.test.ts`
预期：typecheck PASS（若 d.ts 形态不符，按 d.ts 调整 `block` 读取路径）；测试 PASS

- [ ] **步骤 8：Commit**

```bash
git add src/client/table.tsx src/client/toolview.tsx src/client/index.ts tests/client/table.test.ts
git commit -m "feat: zentao 工具卡表格渲染（tool.call.toolview）"
```

---

### 任务 6：客户端侧栏底部面板（sidebar.footer.action）

**文件：**
- 创建：`src/client/panel.tsx`
- 修改：`src/client/index.ts`
- 测试：`tests/client/panel.test.ts`（纯函数部分）

- [ ] **步骤 1：编写失败的测试（面板数据纯函数）**

```ts
// tests/client/panel.test.ts
import { describe, it, expect } from "vitest";
import { overviewSummary, type OverviewResponse } from "../src/client/panel.js";

describe("overviewSummary", () => {
  it("汇总计数", () => {
    const res: OverviewResponse = {
      myTasks: [{ id: 1 }, { id: 2 }],
      myBugs: [{ id: 1 }],
      activeProjects: [{ id: 87 }],
    };
    expect(overviewSummary(res)).toEqual({ tasks: 2, bugs: 1, projects: 1 });
  });

  it("error 时返回零计数 + error 标记", () => {
    const res: OverviewResponse = { myTasks: [], myBugs: [], activeProjects: [], error: "未登录" };
    expect(overviewSummary(res)).toEqual({ tasks: 0, bugs: 0, projects: 0, error: "未登录" });
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/client/panel.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：实现 src/client/panel.tsx**

```tsx
/**
 * 侧栏底部"禅道"入口（sidebar.footer.action）+ 弹出面板。面板展示
 * 我的任务 / 我的 Bug / 进行中项目三个区块，数据来自同源
 * /__dsh-zentao__/overview。
 */
import { createElement, useEffect, useState } from "react";
import type { SidebarFooterActionOwnerProps } from "@deepseek-ai/dsh-client-ui-slots";

export interface OverviewResponse {
  myTasks: { id: string | number; name: string; status: string; [k: string]: unknown }[];
  myBugs: { id: string | number; title: string; status: string; [k: string]: unknown }[];
  activeProjects: { id: string | number; name: string; status: string; [k: string]: unknown }[];
  error?: string;
}

export function overviewSummary(res: OverviewResponse) {
  const base = {
    tasks: Array.isArray(res.myTasks) ? res.myTasks.length : 0,
    bugs: Array.isArray(res.myBugs) ? res.myBugs.length : 0,
    projects: Array.isArray(res.activeProjects) ? res.activeProjects.length : 0,
  };
  return res.error !== undefined ? { ...base, error: res.error } : base;
}

const OVERVIEW_URL = "/__dsh-zentao__/overview";

function useOverview(): OverviewResponse | null {
  const [data, setData] = useState<OverviewResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(OVERVIEW_URL, { cache: "no-store" })
      .then((r) => r.json() as Promise<OverviewResponse>)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData({ myTasks: [], myBugs: [], activeProjects: [], error: "网络错误" }); });
    return () => { alive = false; };
  }, []);
  return data;
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "doing" || status === "active"
    ? "var(--dsh-accent, #2f6fed)"
    : status === "closed" || status === "done"
      ? "var(--dsh-text-secondary, #6b7280)"
      : "var(--dsh-warning, #b45309)";
  return createElement("span", { style: { color, fontWeight: "600" } }, status);
}

function Section({ title, rows, nameKey }: {
  title: string; rows: { id: string | number; status: string; [k: string]: unknown }[]; nameKey: "name" | "title";
}) {
  return createElement("div", { style: { marginBottom: "14px" } },
    createElement("div", { style: sectionTitleStyle }, `${title}（${rows.length}）`),
    rows.length === 0
      ? createElement("div", { style: emptyStyle }, "暂无数据")
      : createElement("table", { style: tableStyle },
          createElement("tbody", null,
            ...rows.slice(0, 20).map((row, i) =>
              createElement("tr", { key: i }, ...[
                createElement("td", { key: "n", style: tdStyle }, String(row[nameKey] ?? row.id)),
                createElement("td", { key: "s", style: tdStyle }, createElement(StatusBadge, { status: row.status })),
              ])))),
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: "600", color: "var(--dsh-text-secondary, #6b7280)",
  marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: "13px",
};
const tdStyle: React.CSSProperties = {
  padding: "4px 8px 4px 0", borderBottom: "1px solid var(--dsh-border, #e3e6ea)",
  maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const emptyStyle: React.CSSProperties = {
  padding: "10px", color: "var(--dsh-text-secondary, #6b7280)", fontSize: "13px",
  border: "1px dashed var(--dsh-border, #e3e6ea)", borderRadius: "6px", textAlign: "center",
};

function PanelBody() {
  const data = useOverview();
  if (data === null) return createElement("div", { style: emptyStyle }, "加载中…");
  if (data.error !== undefined) {
    return createElement("div", { style: emptyStyle },
      `禅道数据获取失败：${data.error}。请确认已安装并登录：npm i -g zentao-cli && zentao login`);
  }
  return createElement("div", null,
    createElement(Section, { title: "我的任务", rows: data.myTasks, nameKey: "name" }),
    createElement(Section, { title: "我的 Bug", rows: data.myBugs, nameKey: "title" }),
    createElement(Section, { title: "进行中的项目", rows: data.activeProjects, nameKey: "name" }),
  );
}

/** 侧栏底部入口：wide 时显示图标+文字行，rail 时只显示图标；点击弹出面板。 */
export function ZentaoFooterAction({ wide }: SidebarFooterActionOwnerProps) {
  const [open, setOpen] = useState(false);
  return createElement("div", { style: { position: "relative" } },
    createElement("button", {
      onClick: () => setOpen(!open),
      style: footerActionStyle(wide),
      title: "禅道",
      "data-dsh-zentao": "trigger",
    }, wide ? "禅道" : "禅"),
    open && createElement("div", { style: overlayStyle },
      createElement("div", { style: panelStyle },
        createElement("div", { style: panelHeaderStyle },
          createElement("span", { style: { fontWeight: "600" } }, "禅道概览"),
          createElement("button", {
            onClick: () => setOpen(false),
            style: closeStyle,
            "aria-label": "关闭",
          }, "×")),
        createElement(PanelBody, null))),
  );
}

const footerActionStyle = (wide: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: wide ? "100%" : "40px", height: "32px",
  border: "none", background: "transparent", cursor: "pointer",
  fontSize: "13px", color: "var(--dsh-text-secondary, #6b7280)",
});
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: "0", zIndex: 999,
  background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
};
const panelStyle: React.CSSProperties = {
  width: "min(520px, 92vw)", maxHeight: "70vh", overflowY: "auto",
  background: "var(--dsh-surface, #fff)", border: "1px solid var(--dsh-border, #e3e6ea)",
  borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: "16px 20px",
};
const panelHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  marginBottom: "12px",
};
const closeStyle: React.CSSProperties = {
  border: "none", background: "transparent", fontSize: "18px", cursor: "pointer",
  color: "var(--dsh-text-secondary, #6b7280)", padding: "0 4px",
};
```

- [ ] **步骤 4：修改 src/client/index.ts 注册 footer action**

```ts
// src/client/index.ts
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { ZentaoToolView } from "./toolview.tsx";
import { ZentaoFooterAction } from "./panel.tsx";

export const inject = ["slots"];

export function apply(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "zentao",
  }, ZentaoToolView));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "zentao",
    locale: "zentao",
    label: () => "禅道",
    // owner props { wide } 由 sidebar shell 传入
  }, ZentaoFooterAction));
}
```

> 注意：`sidebar.footer.action` 的注册形状以 `ui-sidebar` 声明的 SlotMap（`{kind:'list'; scope:'root'; owner: SidebarFooterActionOwnerProps}`）为准，参照 `ui-trajectory` 注册 `conversation.view` 的写法（`register({name, id, order, locale, label, inject}, Component)`）。若 list 插槽必须提供 `inject` 工厂，补一个返回 `{}` 的即可；编译以 d.ts 为准。

- [ ] **步骤 5：运行 typecheck + 测试**

运行：`npm run typecheck && npx vitest run tests/client/panel.test.ts`
预期：typecheck PASS（按 d.ts 微调注册形状）；测试 PASS

- [ ] **步骤 6：Commit**

```bash
git add src/client/panel.tsx src/client/index.ts tests/client/panel.test.ts
git commit -m "feat: 侧栏底部禅道面板（sidebar.footer.action）"
```

---

### 任务 7：README + 全量验证 + 冒烟

**文件：**
- 创建：`README.md`
- 创建：`LICENSE`（MIT）
- 修改：无

- [ ] **步骤 1：README.md**

```markdown
# dsh-zentao

DSH 插件：让 dsh 会话查询和操作禅道（ZenTao）数据。

- **1 个 `zentao` 薄代理工具**：story/bug/task/project/execution/product 等 20 个模块的列表/详情/创建/更新/删除/状态流转
- **对话内表格卡片**：列表/详情在 Web 客户端渲染为原生表格（`tool.call.toolview`）
- **侧栏底部面板**：我的任务 / 我的 Bug / 进行中项目（`sidebar.footer.action`）

数据访问复用 `zentao` CLI（子进程调用），凭证由 CLI 内部管理，**插件不读取、不存储任何凭证**。

## 安装

```bash
# 1. 安装并登录 zentao CLI（一次性）
npm i -g zentao-cli
zentao login

# 2. 安装插件
dsh plugin --profile <profile> add dsh-zentao
# 或本地开发：dsh plugin --profile <profile> add link:/path/to/dsh-zentao
```

## 工具用法

```text
zentao 模块=bug 动作=list product=2                  # 产品 #2 的 Bug 列表
zentao 模块=task 动作=list executionID=168           # 执行 #168 的任务
zentao 模块=bug 动作=get id=3395                     # Bug 详情
zentao 模块=bug 动作=create fields={title:..., severity:2, assignedTo:admin}
zentao 模块=bug 动作=resolve id=3395 fields={resolution:fixed, assignedTo:admin, resolvedBuild:trunk, comment:已修复}
zentao 模块=task 动作=start id=15317
```

范围参数：story/bug/release/feedback/ticket → `product`；execution/build → `project`；**task → `executionID`**（注意不是 execution）。

## 已知局限

- 列表统一 `--recPerPage=200` 拉全量（`--filter` 与分页不兼容的 pitfall），大列表在模型侧按 status/assignedTo 过滤
- `bug resolve` 必须提供 resolution + assignedTo + resolvedBuild + comment（服务端硬性要求）
- 禅道无"我的任务"全局入口（task 列表必须按 execution），面板"我的任务"默认空，可改用 `zentao task list executionID=<id>` 查询
- 面板 Bug 视图按产品逐一遍历（产品数多时较慢）

## 开发

```bash
npm run verify   # typecheck + test + build
```

## License

MIT
```

- [ ] **步骤 2：LICENSE（MIT）**

```text
MIT License

Copyright (c) 2026 zhangbei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **步骤 3：全量验证**

运行：`npm run verify`
预期：typecheck PASS、全部测试 PASS、build 产出 `lib/index.js` + `lib/client.js`

- [ ] **步骤 4：产物级冒烟（Node 加载 + mock ctx apply）**

```bash
node --input-type=module -e "
import { apply } from './lib/index.js';
const registered = [];
const sections = [];
const ctx = {
  tools: { register: (d) => { registered.push(d.name); return () => {}; } },
  systemPrompt: { section: (s) => sections.push(s.name) },
  webServer: { register: (r) => { registered.push(r.path); return () => {}; } },
  effect: (fn) => fn(),
};
apply(ctx);
console.log('tools:', registered.filter((x) => typeof x === 'string' && !x.startsWith('/')));
console.log('routes:', registered.filter((x) => typeof x === 'string' && x.startsWith('/')));
console.log('sections:', sections);
"
```

预期：输出 `tools: ['zentao']`、`routes: ['/__dsh-zentao__/overview']`、`sections: ['tool:zentao']`

- [ ] **步骤 5：Commit**

```bash
git add README.md LICENSE
git commit -m "docs: README + LICENSE"
```

---

### 任务 8：本机安装验证（dsh web profile）

**文件：** 无（环境操作）

- [ ] **步骤 1：确认 web profile 当前插件**

运行：`dsh --profile web plugin list`（或 `dsh plugin --profile web list`）
预期：看到现有插件（browser 等）

- [ ] **步骤 2：以 link 方式安装 dsh-zentao**

运行：`dsh plugin --profile web add link:/Users/zhangbei/code/dsh-zentao`
预期：安装成功

- [ ] **步骤 3：验证 bundle 生效**

运行：`dsh --profile web --dump-config`（或等价命令）
预期：cordis 配置里出现 `id: zentao, name: dsh-zentao`

- [ ] **步骤 4：启动 web 客户端冒烟**

运行：`dsh --profile web` 启动，浏览器打开客户端
预期：
- 对话中让模型执行 `zentao bug list product=3` → 对话内出现 Bug 表格卡片
- 侧栏底部出现"禅道"入口 → 点击弹出面板，显示我的 Bug / 进行中项目（我的任务为空 + 提示）

- [ ] **步骤 5：回归确认**

运行：确认 dsh-browser 等既有插件不受影响（侧栏 footer action 与 browser 的 tapIndex 面板互不冲突）
预期：无冲突

- [ ] **步骤 6：提交安装说明变更（如需）**

运行：若 README 需要补充本机安装路径示例，更新后 commit
预期：无必须变更

---

## 规格覆盖度对照

| 设计文档章节 | 实现任务 |
|-------------|---------|
| zentao 工具（薄代理） | 任务 2（CLI 层）+ 任务 3（工具定义） |
| 模块/动作白名单 + resolve 4 字段 | 任务 3（schema.ts） |
| /zentao/overview 端点 | 任务 4（api.ts） |
| 表格工具卡 | 任务 5（toolview.tsx） |
| 侧栏底部面板 | 任务 6（panel.tsx） |
| 错误处理总则 | 任务 2（CLI 错误映射）+ 任务 4（端点错误结构）+ 任务 6（面板错误态） |
| 发布与安装 | 任务 1（骨架）+ 任务 7（README）+ 任务 8（本机安装验证） |
| 范围外（不做图表/凭证/API 直连） | 不实现（YAGNI） |

## 自检记录

- **占位符扫描**：任务 3 步骤 7 曾以"先占位 api"表述，已修正为"本任务只注册工具，index.ts 先只调用 applyTools，任务 4 再补 api 行"。
- **类型一致性**：`ZentaoArgs`（schema.ts）→ `buildCliArgs` → `runZentao`（cli.ts）→ `execute` 返回 `{module, action, data, count}`（tools.ts）→ 客户端 `ToolResultPayload`（table.tsx）字段一致。
- **CLI 参数实测**：task 列表用 `--executionID`（非 `--execution`）；bug/story 用 `--product`；本项目真实 ID（products 2..、executions 168/169）已用于任务 8 冒烟。
