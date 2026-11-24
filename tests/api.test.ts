import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  registerOverviewApi,
  registerLoginApi,
  overviewViewData,
  createViewQuery,
  buildLoginArgs,
  panelFiltersOf,
  overviewViewOf,
  executionOverrideOf,
  registerDetailApi,
  TASK_PANEL_FIELDS,
  BUG_PANEL_FIELDS,
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
    expect(JSON.parse(res.body).error).toMatch(/execution/);
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
  function fakeReq(method: string, body: unknown) {
    const req = new EventEmitter() as EventEmitter & { method: string };
    req.method = method;
    process.nextTick(() => {
      req.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body)));
      req.emit("end");
    });
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

  it("缺少必要字段返回 400，不调用 CLI", async () => {
    const run = vi.fn(async () => {});
    const route = setup(run);
    const res = fakeRes();
    await route.handler(fakeReq("POST", { server: "http://z" }) as never, res as never);
    expect(run).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
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
