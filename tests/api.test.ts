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
