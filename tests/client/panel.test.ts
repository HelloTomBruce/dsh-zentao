import { describe, it, expect } from "vitest";
import { overviewSummary, type OverviewResponse } from "../../src/client/overview.js";

describe("overviewSummary", () => {
  it("汇总任务/Bug 计数，未关闭 Bug 单独统计", () => {
    const res: OverviewResponse = {
      tasks: [{ id: 1, name: "A", status: "wait" }, { id: 2, name: "B", status: "doing" }],
      bugs: [
        { id: 1, title: "B1", status: "active" },
        { id: 2, title: "B2", status: "closed" },
        { id: 3, title: "B3", status: "resolved" },
      ],
    };
    expect(overviewSummary(res)).toEqual({ tasks: 2, bugs: 3, openBugs: 2 });
  });

  it("全部 Bug 已关闭时 openBugs 为 0", () => {
    const res: OverviewResponse = {
      tasks: [],
      bugs: [{ id: 1, title: "B1", status: "closed" }],
    };
    expect(overviewSummary(res)).toEqual({ tasks: 0, bugs: 1, openBugs: 0 });
  });

  it("error 时返回零计数 + error 标记", () => {
    const res: OverviewResponse = { tasks: [], bugs: [], error: "未登录" };
    expect(overviewSummary(res)).toEqual({ tasks: 0, bugs: 0, openBugs: 0, error: "未登录" });
  });
});
