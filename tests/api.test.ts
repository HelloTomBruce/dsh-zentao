import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  registerOverviewApi,
  registerLoginApi,
  registerLogoutApi,
  overviewViewData,
  createViewQuery,
  buildLoginArgs,
  panelFiltersOf,
  overviewViewOf,
  executionOverrideOf,
  scopeOverridesOf,
  effectiveConfigOf,
  registerDetailApi,
  registerMetaApi,
  TASK_PANEL_FIELDS,
  BUG_PANEL_FIELDS,
  STORY_PANEL_FIELDS,
} from "../src/api.js";

describe("createViewQuery（按视图构造单条 CLI 查询）", () => {
  it("tasks：execution → task list --execution-id", async () => {
    const run = vi.fn(async () => []);
    const q = createViewQuery({ product: 2, execution: 168 }, "tasks", {}, run);
    expect(q).not.toBeNull();
    await q!();
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=168", `--fields=${TASK_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
  });

  it("bugs：product > project > execution 范围兜底", async () => {
    const run = vi.fn(async () => []);
    await createViewQuery({ product: 2, execution: 168 }, "bugs", {}, run)!();
    expect(run).toHaveBeenCalledWith(["bug", "list", "--product=2", `--fields=${BUG_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    await createViewQuery({ project: 5, execution: 168 }, "bugs", {}, run)!();
    expect(run).toHaveBeenCalledWith(["bug", "list", "--project=5", `--fields=${BUG_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    await createViewQuery({ execution: 168 }, "bugs", {}, run)!();
    expect(run).toHaveBeenCalledWith(["bug", "list", "--execution=168", `--fields=${BUG_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
  });

  it("scope 缺失返回 null（tasks 缺 execution / bugs 三全无）", () => {
    const run = vi.fn(async () => []);
    expect(createViewQuery({ product: 2 }, "tasks", {}, run)).toBeNull();
    expect(createViewQuery({}, "bugs", {}, run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("筛选参数透传：browse/filter/search 拼入对应视图查询", async () => {
    const run = vi.fn(async () => []);
    await createViewQuery({ product: 2, execution: 168 }, "tasks", { browse: "all", filter: "status=doing", search: "登录" }, run)!();
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=168", `--fields=${TASK_PANEL_FIELDS}`, "--browse-type=all", "--filter=status=doing", "--search=登录", `--page-size=200`, "--all"]);
    await createViewQuery({ product: 2, execution: 168 }, "bugs", { filter: "status=active" }, run)!();
    expect(run).toHaveBeenCalledWith(["bug", "list", "--product=2", `--fields=${BUG_PANEL_FIELDS}`, "--filter=status=active", `--page-size=200`, "--all"]);
  });

  it("当后端节点异常返回其他 execution 的回退数据时自动重试，命中正确 execution", async () => {
    let call = 0;
    const run = vi.fn(async () => {
      call++;
      if (call === 1) return [{ id: 15320, execution: "169", name: "开发" }];
      return [{ id: 16561, execution: "65", name: "全量数据同步" }];
    });
    const tasks = await createViewQuery({ execution: 65 }, "tasks", {}, run)!();
    expect(run).toHaveBeenCalledTimes(2);
    expect(tasks).toEqual([{ id: 16561, execution: "65", name: "全量数据同步" }]);
  });

  it("「服务端分页未向前推进」瞬时错误自动重试（集群节点容错）", async () => {
    let taskCalls = 0;
    const run = vi.fn(async () => {
      taskCalls++;
      if (taskCalls < 3) throw new Error("zentao: 禅道服务端返回错误（Url：，Status：）：服务端分页未向前推进");
      return [{ id: 1, name: "T1", execution: "65" }];
    });
    const tasks = await createViewQuery({ execution: 65 }, "tasks", {}, run)!();
    expect(taskCalls).toBe(3);
    expect(tasks).toHaveLength(1);
  });

  it("分页错误重试 Bug 查询；非分页错误（如未登录）不重试", async () => {
    let bugCalls = 0;
    const runRetry = vi.fn(async () => {
      bugCalls++;
      if (bugCalls === 1) throw new Error("zentao: 服务端分页未向前推进");
      return [{ id: 9, title: "B9" }];
    });
    const bugs = await createViewQuery({ product: 2 }, "bugs", {}, runRetry as never)!();
    expect(bugCalls).toBe(2);
    expect(bugs).toHaveLength(1);

    let authCalls = 0;
    const runAuth = vi.fn(async () => {
      authCalls++;
      throw new Error("zentao: 未找到可用的用户配置（1006）");
    });
    await expect(createViewQuery({ product: 2 }, "bugs", {}, runAuth)!()).rejects.toThrow(/1006/);
    expect(authCalls).toBe(1);
  });
});

describe("overviewViewData", () => {
  it("聚合单视图行，带配置摘要与 view 标记", async () => {
    const data = await overviewViewData({ product: 2, execution: 168 }, "tasks",
      async () => [{ id: 1, name: "任务A", status: "wait" }, { id: 2, name: "任务B", status: "doing" }]);
    expect(data.view).toBe("tasks");
    expect(data.rows).toHaveLength(2);
    expect(data.config).toEqual({ product: 2, execution: 168 });
    expect(data.note).toBeUndefined();
    expect(data.error).toBeUndefined();
  });

  it("query 为 null（scope 缺失）时返回空行 + note", async () => {
    const data = await overviewViewData({ product: 2 }, "tasks", null);
    expect(data.rows).toEqual([]);
    expect(data.note).toMatch(/execution/);
    const bugData = await overviewViewData({}, "bugs", null);
    expect(bugData.note).toMatch(/product/);
  });

  it("查询失败透出错误信息", async () => {
    const data = await overviewViewData({ product: 2, execution: 168 }, "bugs",
      async () => { throw new Error("未登录"); });
    expect(data.rows).toEqual([]);
    expect(data.error).toMatch(/未登录/);
  });
});

describe("registerOverviewApi", () => {
  interface Route {
    kind: string;
    path: string;
    handler: (req: unknown, res: unknown) => Promise<void>;
  }

  function fakeReq(method: string, url: string) {
    const req = new EventEmitter() as EventEmitter & { method: string; url: string };
    req.method = method;
    req.url = url;
    return req;
  }

  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(s: number, _headers: unknown) { this.status = s; },
      end(b: string) { this.body = b; },
    };
  }

  function setup(deps: {
    readConfig?: (ws: string) => Promise<{ ok: true; config: unknown } | { ok: false; error: string }>;
    run?: (args: string[]) => Promise<unknown>;
  } = {}): Route {
    const registered: Route[] = [];
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: Route) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          registered.push(r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    registerOverviewApi(ctx as never, deps as never);
    return registered[0] as Route;
  }

  it("防重复注册：多次调用 registerOverviewApi 会清理旧路由而不报错", () => {
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: Route) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    const dispose1 = registerOverviewApi(ctx as never);
    expect(exactMap.has("/__dsh-zentao__/overview")).toBe(true);
    const dispose2 = registerOverviewApi(ctx as never);
    expect(exactMap.has("/__dsh-zentao__/overview")).toBe(true);
    dispose2();
    expect(exactMap.has("/__dsh-zentao__/overview")).toBe(false);
  });

  it("注册 /__dsh-zentao__/overview 精确路由", () => {
    const route = setup();
    expect(route.kind).toBe("exact");
    expect(route.path).toBe("/__dsh-zentao__/overview");
  });

  it("缺 workspace 参数返回 400", async () => {
    const res = fakeRes();
    await setup().handler(fakeReq("GET", "/__dsh-zentao__/overview"), res);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/workspace/);
  });

  it("非法视图参数返回 400（白名单 tasks/bugs）", async () => {
    const res = fakeRes();
    await setup().handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&view=nope"), res);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/非法视图/);
  });

  it("工作区未配置时返回 unconfigured 引导态", async () => {
    const res = fakeRes();
    await setup({ readConfig: async () => ({ ok: true, config: null }) })
      .handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa"), res);
    expect(JSON.parse(res.body)).toMatchObject({ unconfigured: true });
  });

  it("配置解析失败时返回带文件名的 error", async () => {
    const res = fakeRes();
    await setup({ readConfig: async () => ({ ok: false, error: "不是合法 JSON" }) })
      .handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa"), res);
    expect(JSON.parse(res.body).error).toMatch(/\.dsh-zentao\.json/);
  });

  it("按视图懒加载：view=tasks 只查 task，view=bugs 只查 bug（默认 tasks）", async () => {
    const run = vi.fn(async (args: string[]) =>
      args[0] === "task" ? [{ id: 1, name: "T1", status: "doing" }] : [{ id: 9, title: "B9", status: "active" }]);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run });
    // 默认视图（无 view 参数）= tasks：只应调 task 查询
    const res1 = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa"), res1);
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=168", `--fields=${TASK_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    expect(run).toHaveBeenCalledTimes(1);
    const body1 = JSON.parse(res1.body);
    expect(body1.view).toBe("tasks");
    expect(body1.rows).toHaveLength(1);
    // view=bugs：只应调 bug 查询
    const res2 = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&view=bugs"), res2);
    expect(run).toHaveBeenCalledWith(["bug", "list", "--product=2", `--fields=${BUG_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    expect(run).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse(res2.body);
    expect(body2.view).toBe("bugs");
    expect(body2.rows[0]).toEqual({ id: 9, title: "B9", status: "active" });
  });

  it("60s 内同 工作区+视图+筛选 命中缓存；视图切换独立缓存", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run });
    const hit = async (suffix: string) => {
      const res = fakeRes();
      await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa${suffix}`), res);
      return res;
    };
    await hit("");           // tasks 查询 1 次
    await hit("");           // 命中缓存
    expect(run).toHaveBeenCalledTimes(1);
    await hit("&view=bugs"); // bugs 视图 → 新缓存键，再查 1 次
    expect(run).toHaveBeenCalledTimes(2);
    await hit("&view=bugs"); // 命中缓存
    expect(run).toHaveBeenCalledTimes(2);
    await hit(`&filter=${encodeURIComponent("status=doing")}`); // tasks 新筛选 → 再查
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("fresh=1 绕过缓存强制重查", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run });
    const call = async (fresh: boolean) => {
      const res = fakeRes();
      await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa${fresh ? "&fresh=1" : ""}`), res);
      return res;
    };
    await call(false);
    await call(false);
    expect(run).toHaveBeenCalledTimes(1);
    await call(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("execution 覆盖：tasks 查询换 execution-id 且独立缓存；绑定原样返回", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 65, executions: [65, 66] } }), run });
    const hit = async (suffix: string) => {
      const res = fakeRes();
      await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa${suffix}`), res);
      return res;
    };
    await hit(""); // 默认 execution=65
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=65", `--fields=${TASK_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    expect(run).toHaveBeenCalledTimes(1);
    await hit(""); // 命中缓存
    expect(run).toHaveBeenCalledTimes(1);
    await hit("&execution=66"); // 切换执行 → 新缓存键
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=66", `--fields=${TASK_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    expect(run).toHaveBeenCalledTimes(2);
    const res3 = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&execution=66"), res3);
    expect(run).toHaveBeenCalledTimes(2); // 同 execution 命中缓存
    expect(JSON.parse(res3.body).config).toEqual({ product: 2, execution: 65, executions: [65, 66] }); // 绑定原样返回
  });

  it("非法 execution 参数返回 400", async () => {
    const res = fakeRes();
    await setup().handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&execution=abc"), res);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/scope/);
  });

  it("非法 product / project 参数返回 400", async () => {
    const res1 = fakeRes();
    await setup().handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&product=abc"), res1);
    expect(res1.status).toBe(400);
    const res2 = fakeRes();
    await setup().handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&project=1e3"), res2);
    expect(res2.status).toBe(400);
  });

  it("无绑定 + 显式 scope：绕过 unconfigured 直接查询，响应带 effective", async () => {
    const run = vi.fn(async () => [{ id: 61, title: "S1", status: "active" }]);
    const route = setup({ readConfig: async () => ({ ok: true, config: null }), run });
    const res = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&view=stories&product=2"), res);
    expect(run).toHaveBeenCalledWith(["story", "list", "--product=2", `--fields=${STORY_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    const body = JSON.parse(res.body);
    expect(body.unconfigured).toBeUndefined();
    expect(body.rows).toHaveLength(1);
    expect(body.config).toBeUndefined(); // 无文件绑定
    expect(body.effective).toEqual({ product: 2 });
  });

  it("无绑定且无显式 scope 仍返回 unconfigured", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: null }), run });
    const res = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa"), res);
    expect(JSON.parse(res.body).unconfigured).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("显式 execution 覆盖在 bugs 视图清除绑定 product（手动选择优先）", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 65 } }), run });
    const res = fakeRes();
    await route.handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa&view=bugs&execution=168"), res);
    expect(run).toHaveBeenCalledWith(["bug", "list", "--execution=168", `--fields=${BUG_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    const body = JSON.parse(res.body);
    expect(body.config).toEqual({ product: 2, execution: 65 }); // 绑定原样返回
    expect(body.effective).toEqual({ execution: 168 });
  });

  it("显式 scope 参与缓存键：同视图不同 product 独立缓存", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2 } }), run });
    const hit = async (suffix: string) => {
      const res = fakeRes();
      await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa&view=stories${suffix}`), res);
      return res;
    };
    await hit("");              // 绑定 product=2 查询 1 次
    await hit("");              // 命中缓存
    expect(run).toHaveBeenCalledTimes(1);
    await hit("&product=7");    // 显式 product=7 → 新缓存键
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(["story", "list", "--product=7", `--fields=${STORY_PANEL_FIELDS}`, `--page-size=200`, "--all"]);
    await hit("&product=7");    // 命中缓存
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("筛选参数透传到 CLI 查询（filter 经 URL 编码）", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run });
    const res = fakeRes();
    await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa&browse=all&filter=${encodeURIComponent("status=doing")}`), res);
    expect(run).toHaveBeenCalledWith(["task", "list", "--execution-id=168", `--fields=${TASK_PANEL_FIELDS}`, "--browse-type=all", "--filter=status=doing", `--page-size=200`, "--all"]);
    expect(res.status).toBe(200);
  });

  it("非法筛选参数返回 400（白名单校验）", async () => {
    const res = fakeRes();
    await setup().handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=%2Fws%2Fa&filter=${encodeURIComponent("status=doing; rm -rf /")}`), res);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/非法筛选参数/);
  });
});

describe("overviewViewOf", () => {
  const req = (url: string) => ({ url }) as never;

  it("缺省为 tasks", () => {
    expect(overviewViewOf(req("/x?workspace=/ws/a"))).toBe("tasks");
  });

  it("合法视图透传，非法返回 null", () => {
    expect(overviewViewOf(req("/x?view=bugs"))).toBe("bugs");
    expect(overviewViewOf(req("/x?view=nope"))).toBeNull();
  });
});

describe("panelFiltersOf", () => {
  const req = (url: string) => ({ url }) as never;

  it("缺省时返回 {}", () => {
    expect(panelFiltersOf(req("/__dsh-zentao__/overview?workspace=/ws/a"))).toEqual({});
  });

  it("解析并 URL 解码 browse/filter/search", () => {
    const url = `/x?workspace=/w&browse=all&filter=${encodeURIComponent("status=doing")}&search=${encodeURIComponent("登录")}`;
    expect(panelFiltersOf(req(url))).toEqual({ browse: "all", filter: "status=doing", search: "登录" });
  });

  it("search 允许中文但拒绝 - 开头（防 CLI flag 注入）", () => {
    expect(panelFiltersOf(req(`/x?search=${encodeURIComponent("--format=raw")}`))).toBeNull();
    expect(panelFiltersOf(req(`/x?search=${encodeURIComponent("正常关键词")}`))).toEqual({ search: "正常关键词" });
  });

  it("非法字符返回 null", () => {
    expect(panelFiltersOf(req(`/x?filter=${encodeURIComponent("a=b; ls")}`))).toBeNull();
    expect(panelFiltersOf(req(`/x?browse=${encodeURIComponent("all$(id)")}`))).toBeNull();
  });
});

describe("buildLoginArgs", () => {
  it("密码模式", () => {
    expect(buildLoginArgs({ server: "http://z", account: "admin", password: "p" }))
      .toEqual(["login", "-s", "http://z", "-u", "admin", "-p", "p"]);
  });

  it("token 优先于密码", () => {
    expect(buildLoginArgs({ server: "http://z", account: "admin", password: "p", token: "t" }))
      .toEqual(["login", "-s", "http://z", "-u", "admin", "-t", "t"]);
  });

  it("缺少 server / account / 凭证时返回 null", () => {
    expect(buildLoginArgs({ account: "admin", password: "p" })).toBeNull();
    expect(buildLoginArgs({ server: "http://z", password: "p" })).toBeNull();
    expect(buildLoginArgs({ server: "http://z", account: "admin" })).toBeNull();
  });
});

describe("registerLoginApi", () => {
  function fakeReq(method: string, body: unknown, opts: { origin?: string; contentType?: string | null } = {}) {
    const req = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> };
    req.method = method;
    req.headers = {
      host: "127.0.0.1:3080",
      "content-type": "contentType" in opts ? (opts.contentType ?? "") : "application/json",
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
    };
    if (body !== undefined) {
      process.nextTick(() => {
        req.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
        req.emit("end");
      });
    }
    return req;
  }

  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(s: number, _headers: unknown) { this.status = s; },
      end(b: string) { this.body = b; },
    };
  }

  function setup(run: (args: string[]) => Promise<unknown>) {
    const registered: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }[] = [];
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          registered.push(r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    registerLoginApi(ctx as never, run);
    return registered[0];
  }

  it("防重复注册：多次调用 registerLoginApi 会清理旧路由而不报错", () => {
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: { kind: string; path: string }) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    const dispose1 = registerLoginApi(ctx as never, async () => {});
    expect(exactMap.has("/__dsh-zentao__/login")).toBe(true);
    const dispose2 = registerLoginApi(ctx as never, async () => {});
    expect(exactMap.has("/__dsh-zentao__/login")).toBe(true);
    dispose2();
    expect(exactMap.has("/__dsh-zentao__/login")).toBe(false);
  });

  it("注册 /__dsh-zentao__/login 精确路由", () => {
    const route = setup(async () => {});
    expect(route.kind).toBe("exact");
    expect(route.path).toBe("/__dsh-zentao__/login");
  });

  it("登录成功返回 ok:true，CLI 参数正确", async () => {
    const run = vi.fn(async () => {});
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("POST", { server: "http://z", account: "admin", password: "p" }) as never, res as never);
    expect(run).toHaveBeenCalledWith(["login", "-s", "http://z", "-u", "admin", "-p", "p"]);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("CLI 失败时返回 ok:false 与错误信息", async () => {
    const route = setup(async () => { throw new Error("zentao: 当前用户名和密码不正确"); });
    const res = fakeRes();
    await route.handler(fakeReq("POST", { server: "http://z", account: "admin", password: "bad" }) as never, res as never);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: "zentao: 当前用户名和密码不正确" });
  });

  it("非本机 Origin 拒绝（403，不调用 CLI）", async () => {
    const run = vi.fn(async () => {});
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("POST", { server: "http://z", account: "a", password: "p" }, { origin: "https://evil.example" }) as never, res as never);
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("content-type 非 JSON 返回 415（防 text/plain 简单请求跨源）", async () => {
    const run = vi.fn(async () => {});
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("POST", '{"server":"http://z"}', { contentType: "text/plain" }) as never, res as never);
    expect(res.status).toBe(415);
    expect(run).not.toHaveBeenCalled();
  });

  it("缺少必要字段返回 400，不调用 CLI", async () => {
    const run = vi.fn(async () => {});
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("POST", { server: "http://z" }) as never, res as never);
    expect(run).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});

describe("registerLogoutApi（清理当前登录状态）", () => {
  function fakeReq(method: string, headers: Record<string, string> = { host: "127.0.0.1:3080" }) {
    return { method, headers } as never;
  }
  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(st: number, _headers: unknown) { this.status = st; },
      end(b: string) { this.body = b; },
    };
  }
  function setup(run: (args: string[]) => Promise<unknown>) {
    const registered: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }[] = [];
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          registered.push(r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    registerLogoutApi(ctx as never, run);
    return registered[0];
  }

  it("注册 /__dsh-zentao__/logout 精确路由，仅接受 POST", async () => {
    const route = setup(async () => "");
    expect(route.kind).toBe("exact");
    expect(route.path).toBe("/__dsh-zentao__/logout");
    const res = fakeRes();
    await route.handler(fakeReq("GET"), res as never);
    expect(res.status).toBe(405);
  });

  it("拒绝非本机来源（登出覆盖凭证，同 login 的 CSRF 面）", async () => {
    const route = setup(async () => "");
    const res = fakeRes();
    await route.handler(fakeReq("POST", { host: "127.0.0.1:3080", origin: "https://evil.example" }), res as never);
    expect(res.status).toBe(403);
  });

  it("转发 zentao auth logout（清当前 profile 本地凭证）", async () => {
    const run = vi.fn(async () => "");
    const res = fakeRes();
    await setup(run).handler(fakeReq("POST"), res as never);
    expect(run).toHaveBeenCalledWith(["auth", "logout"]);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("CLI 失败透出 ok:false + error（不抛 500，面板按未登录继续流程）", async () => {
    const run = vi.fn(async () => { throw new Error("zentao: 无已保存账号"); });
    const res = fakeRes();
    await setup(run).handler(fakeReq("POST"), res as never);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: "zentao: 无已保存账号" });
  });
});

describe("executionOverrideOf（多执行切换）", () => {
  const req = (url: string) => ({ url }) as never;

  it("缺省为 undefined", () => {
    expect(executionOverrideOf(req("/x?workspace=/ws/a"))).toBeUndefined();
  });

  it("合法正整数透传，非法返回 null", () => {
    expect(executionOverrideOf(req("/x?execution=66"))).toBe(66);
    expect(executionOverrideOf(req("/x?execution=abc"))).toBeNull();
    expect(executionOverrideOf(req("/x?execution=-1"))).toBeNull();
    expect(executionOverrideOf(req("/x?execution=0"))).toBeNull();
  });
});

describe("scopeOverridesOf（面板范围选择器）", () => {
  const req = (url: string) => ({ url }) as never;

  it("全部缺省返回 undefined（无覆盖语义）", () => {
    expect(scopeOverridesOf(req("/x?workspace=/ws/a"))).toBeUndefined();
  });

  it("解析 product/project/execution 单个与组合", () => {
    expect(scopeOverridesOf(req("/x?product=2"))).toEqual({ product: 2 });
    expect(scopeOverridesOf(req("/x?project=5&execution=168"))).toEqual({ project: 5, execution: 168 });
    expect(scopeOverridesOf(req("/x?product=2&project=5&execution=168"))).toEqual({ product: 2, project: 5, execution: 168 });
  });

  it("任一参数非法返回 null（含宽松数字形态）", () => {
    expect(scopeOverridesOf(req("/x?product=abc"))).toBeNull();
    expect(scopeOverridesOf(req("/x?product=2&project=0"))).toBeNull();
    expect(scopeOverridesOf(req("/x?execution=1e3"))).toBeNull();
    expect(scopeOverridesOf(req("/x?product=-3"))).toBeNull();
    expect(scopeOverridesOf(req("/x?project=0x10"))).toBeNull();
  });
});

describe("effectiveConfigOf（绑定 + 显式覆盖合并）", () => {
  it("无覆盖 → 原绑定（含 null → 空对象）", () => {
    expect(effectiveConfigOf({ product: 2 }, undefined)).toEqual({ product: 2 });
    expect(effectiveConfigOf(null, undefined)).toEqual({});
  });

  it("显式 product 覆盖，未给维度回落绑定", () => {
    expect(effectiveConfigOf({ product: 2, execution: 65 }, { product: 3 }))
      .toEqual({ product: 3, execution: 65 });
  });

  it("显式项目/执行而未选产品 → 清除绑定 product（防 Bug 视图 product 优先级盖掉手动选择）", () => {
    expect(effectiveConfigOf({ product: 2, execution: 65 }, { execution: 66 }))
      .toEqual({ execution: 66 });
    expect(effectiveConfigOf({ product: 2 }, { project: 5 }))
      .toEqual({ project: 5 });
  });

  it("config null + 纯显式覆盖 → 手动选择即全部配置（未配置工作区也可查询）", () => {
    expect(effectiveConfigOf(null, { execution: 168 })).toEqual({ execution: 168 });
    expect(effectiveConfigOf(null, { product: 2 })).toEqual({ product: 2 });
  });
});

describe("registerDetailApi", () => {
  function fakeReq(url: string) {
    return { method: "GET", url } as never;
  }
  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(s: number, _headers: unknown) { this.status = s; },
      end(b: string) { this.body = b; },
    };
  }
  function setup(run: (args: string[]) => Promise<unknown>) {
    const registered: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }[] = [];
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          registered.push(r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    registerDetailApi(ctx as never, run);
    return registered[0];
  }

  it("转发 <module> get <id> 并解包 {data, meta} 信封返回完整对象", async () => {
    const detail = { id: 61, title: "需求A", spec: "<p>描述</p>" };
    const run = vi.fn(async () => ({ data: detail, meta: { resultObjectType: "story" } }));
    const res = fakeRes();
    await setup(run).handler(fakeReq("/__dsh-zentao__/detail?view=stories&id=61") as never, res as never);
    expect(run).toHaveBeenCalledWith(["story", "get", "61"]);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("stories");
    expect(body.data).toEqual(detail); // 解包后无双层嵌套
    expect(body.data.meta).toBeUndefined();
  });

  it("testtask 无 get 子命令返回 unsupported（不调 CLI）", async () => {
    const run = vi.fn(async () => ({}));
    const res = fakeRes();
    await setup(run).handler(fakeReq("/__dsh-zentao__/detail?view=testtasks&id=33") as never, res as never);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toEqual({ view: "testtasks", id: 33, unsupported: true });
  });

  it("非法视图 / 非法 id 返回 400", async () => {
    const res1 = fakeRes();
    await setup(async () => ({})).handler(fakeReq("/__dsh-zentao__/detail?view=nope&id=1") as never, res1 as never);
    expect(res1.status).toBe(400);
    const res2 = fakeRes();
    await setup(async () => ({})).handler(fakeReq("/__dsh-zentao__/detail?view=bugs") as never, res2 as never);
    expect(res2.status).toBe(400);
  });

  it("CLI 错误透出 error 信息", async () => {
    const res = fakeRes();
    await setup(async () => { throw new Error("zentao: 对象不存在"); })
      .handler(fakeReq("/__dsh-zentao__/detail?view=bugs&id=999999") as never, res as never);
    expect(JSON.parse(res.body).error).toMatch(/对象不存在/);
  });
});

describe("fetchWithNodeRetry — 耗尽语义", () => {
  it("tasks 3 次全部 execution 不匹配时抛错而非静默返回脏数据", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls++;
      return [{ id: calls, execution: "999", name: "脏数据" }]; // 永远不匹配期望的 65
    });
    await expect(createViewQuery({ execution: 65 }, "tasks", {}, run)!()).rejects.toThrow(/异常执行节点/);
    expect(calls).toBe(3); // 3 次后放弃，不再有第 4 次无校验调用
  });

  it("无形状校验的视图（bugs）耗尽后最后一次调用若成功则返回", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("服务端分页未向前推进");
      return [{ id: 9, title: "B9" }];
    });
    const bugs = await createViewQuery({ product: 2 }, "bugs", {}, run)!();
    expect(calls).toBe(3);
    expect(bugs).toHaveLength(1);
  });
});

describe("executionOverrideOf — 严格数字", () => {
  const req = (url: string) => ({ url }) as never;

  it("拒绝 1e3 / 0x10 等宽松数字形态", () => {
    expect(executionOverrideOf(req("/x?execution=1e3"))).toBeNull();
    expect(executionOverrideOf(req("/x?execution=0x10"))).toBeNull();
    expect(executionOverrideOf(req("/x?execution=66"))).toBe(66);
  });
});

describe("registerMetaApi（范围选择器下拉数据源）", () => {
  function fakeReq(url: string, headers: Record<string, string> = { host: "127.0.0.1:3080" }) {
    return { method: "GET", url, headers } as never;
  }
  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(s: number, _headers: unknown) { this.status = s; },
      end(b: string) { this.body = b; },
    };
  }
  function setup(run: (args: string[]) => Promise<unknown>) {
    const registered: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }[] = [];
    const exactMap = new Map<string, unknown>();
    const ctx = {
      webServer: {
        exact: exactMap,
        register: (r: { kind: string; path: string; handler: (req: never, res: never) => Promise<void> }) => {
          if (exactMap.has(r.path)) throw new Error(`duplicate ${r.kind} route "${r.path}"`);
          exactMap.set(r.path, r);
          registered.push(r);
          return () => { exactMap.delete(r.path); };
        },
      },
    };
    registerMetaApi(ctx as never, run);
    return registered[0];
  }

  it("注册 /__dsh-zentao__/meta/scopes 精确路由，仅接受 GET", async () => {
    const route = setup(async () => ({ data: [] }));
    expect(route.kind).toBe("exact");
    expect(route.path).toBe("/__dsh-zentao__/meta/scopes");
    const res = fakeRes();
    await route.handler({ method: "POST", url: "/__dsh-zentao__/meta/scopes", headers: { host: "127.0.0.1" } } as never, res as never);
    expect(res.status).toBe(405);
  });

  it("拒绝非本机来源（跨源 Origin / 非回环 Host）", async () => {
    const route = setup(async () => ({ data: [] }));
    const res1 = fakeRes();
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes", { host: "127.0.0.1:3080", origin: "https://evil.example" }), res1 as never);
    expect(res1.status).toBe(403);
    const res2 = fakeRes();
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes", { host: "192.168.1.5:3080" }), res2 as never);
    expect(res2.status).toBe(403);
  });

  it("并行拉取产品/项目/执行并裁剪到选择器列", async () => {
    const run = vi.fn(async (args: string[]) => ({ data: [{ id: 1, name: `${args[0]}-1` }] }));
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes"), res as never);
    expect(run).toHaveBeenCalledWith(["product", "list", "--fields=id,name,status", "--all"]);
    expect(run).toHaveBeenCalledWith(["project", "list", "--fields=id,name,status", "--all"]);
    expect(run).toHaveBeenCalledWith(["execution", "list", "--fields=id,name,project,status", "--all"]);
    const body = JSON.parse(res.body);
    expect(body.products).toEqual([{ id: 1, name: "product-1" }]);
    expect(body.projects).toEqual([{ id: 1, name: "project-1" }]);
    expect(body.executions).toEqual([{ id: 1, name: "execution-1" }]);
    expect(body.errors).toBeUndefined();
  });

  it("单项失败降级：该项缺省 + errors 透出，其他项正常", async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === "execution") throw new Error("zentao: 1006 未登录");
      return { data: [{ id: 1, name: `${args[0]}-1` }] };
    });
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes"), res as never);
    const body = JSON.parse(res.body);
    expect(body.products).toHaveLength(1);
    expect(body.projects).toHaveLength(1);
    expect(body.executions).toBeUndefined();
    expect(body.errors.executions).toMatch(/1006/);
  });

  it("60s 内命中缓存；fresh=1 强制重拉", async () => {
    const run = vi.fn(async () => ({ data: [] }));
    const route = setup(run);
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes"), fakeRes() as never);
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes"), fakeRes() as never);
    expect(run).toHaveBeenCalledTimes(3); // 首拉 3 个模块
    await route.handler(fakeReq("/__dsh-zentao__/meta/scopes?fresh=1"), fakeRes() as never);
    expect(run).toHaveBeenCalledTimes(6);
  });
});
