import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  registerOverviewApi,
  registerLoginApi,
  overviewData,
  createQueries,
  buildLoginArgs,
} from "../src/api.js";

describe("createQueries", () => {
  it("execution → task --executionID；product → bug --product（优先级最高）", async () => {
    const run = vi.fn(async (args: string[]) => (args[0] === "task" ? [] : []));
    const queries = createQueries({ product: 2, execution: 168 }, run);
    await Promise.all([queries.tasks(), queries.bugs()]);
    expect(run).toHaveBeenCalledWith(["task", "--executionID=168", "--recPerPage=200"]);
    expect(run).toHaveBeenCalledWith(["bug", "--product=2", "--recPerPage=200"]);
  });

  it("无 product 时 bug 范围按 project > execution 兜底", async () => {
    const run = vi.fn(async () => []);
    await createQueries({ project: 5, execution: 168 }, run).bugs();
    expect(run).toHaveBeenCalledWith(["bug", "--project=5", "--recPerPage=200"]);
    await createQueries({ execution: 168 }, run).bugs();
    expect(run).toHaveBeenCalledWith(["bug", "--execution=168", "--recPerPage=200"]);
  });

  it("缺 execution 时任务查询为空（不调 CLI）", async () => {
    const run = vi.fn(async () => []);
    const tasks = await createQueries({ product: 2 }, run).tasks();
    expect(tasks).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("overviewData", () => {
  it("聚合任务与 Bug，带配置摘要", async () => {
    const queries = {
      tasks: vi.fn(async () => [
        { id: 1, name: "任务A", status: "wait" },
        { id: 2, name: "任务B", status: "doing" },
      ]),
      bugs: vi.fn(async () => [{ id: 1, title: "Bug1", status: "active" }]),
    };
    const data = await overviewData({ product: 2, execution: 168 }, queries);
    expect(queries.tasks).toHaveBeenCalled();
    expect(data.tasks).toHaveLength(2);
    expect(data.bugs).toEqual([{ id: 1, title: "Bug1", status: "active" }]);
    expect(data.config).toEqual({ product: 2, execution: 168 });
    expect(data.note).toBeUndefined();
    expect(data.error).toBeUndefined();
  });

  it("缺 execution 时返回 note 提示", async () => {
    const data = await overviewData({ product: 2 }, {
      tasks: async () => [],
      bugs: async () => [],
    });
    expect(data.tasks).toEqual([]);
    expect(data.note).toMatch(/execution/);
  });

  it("查询失败时另一边仍返回，并透出错误信息", async () => {
    const data = await overviewData({ product: 2, execution: 168 }, {
      tasks: async () => { throw new Error("未登录"); },
      bugs: async () => [{ id: 1, title: "Bug1", status: "active" }],
    });
    expect(data.tasks).toEqual([]);
    expect(data.bugs).toHaveLength(1);
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
    const ctx = {
      webServer: { register: (r: Route) => { registered.push(r); return () => {}; } },
    };
    registerOverviewApi(ctx as never, deps as never);
    return registered[0] as Route;
  }

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

  it("按配置查询任务与 Bug（workspace URL 解码）", async () => {
    const run = vi.fn(async (args: string[]) =>
      args[0] === "task" ? [{ id: 1, name: "T1", status: "doing" }] : [{ id: 9, title: "B9", status: "active" }]);
    const res = fakeRes();
    await setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run })
      .handler(fakeReq("GET", "/__dsh-zentao__/overview?workspace=%2Fws%2Fa"), res);
    expect(run).toHaveBeenCalledWith(["task", "--executionID=168", "--recPerPage=200"]);
    expect(run).toHaveBeenCalledWith(["bug", "--product=2", "--recPerPage=200"]);
    const body = JSON.parse(res.body);
    expect(body.tasks).toHaveLength(1);
    expect(body.bugs).toHaveLength(1);
    expect(body.config).toEqual({ product: 2, execution: 168 });
  });

  it("60s 内同工作区命中缓存（run 只调一次），不同工作区独立查询", async () => {
    const run = vi.fn(async () => []);
    const route = setup({ readConfig: async () => ({ ok: true, config: { product: 2, execution: 168 } }), run });
    const hit = async (ws: string) => {
      const res = fakeRes();
      await route.handler(fakeReq("GET", `/__dsh-zentao__/overview?workspace=${encodeURIComponent(ws)}`), res);
      return res;
    };
    await hit("/ws/a");
    await hit("/ws/a");
    expect(run).toHaveBeenCalledTimes(2); // task + bug 各一次，缓存生效
    await hit("/ws/b");
    expect(run).toHaveBeenCalledTimes(4);
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
    expect(run).toHaveBeenCalledTimes(2);
    await call(true);
    expect(run).toHaveBeenCalledTimes(4);
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
    const ctx = {
      webServer: { register: (r: never) => { registered.push(r); return () => {}; } },
    };
    registerLoginApi(ctx as never, run);
    return registered[0];
  }

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
