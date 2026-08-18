import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { registerOverviewApi, registerLoginApi, overviewData, buildLoginArgs } from "../src/api.js";

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
