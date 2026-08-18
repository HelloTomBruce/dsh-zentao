import { describe, it, expect } from "vitest";
import { overviewSummary, type OverviewResponse } from "../../src/client/overview.js";

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
