import { describe, it, expect } from "vitest";
import { buildOverviewQuery, DEFAULT_FILTER_KEY, defaultTabFilter, FILTER_OPTIONS, overviewSummary, type OverviewResponse, type TabFilterState } from "../../src/client/overview.js";
import { sanitizeAndFormatHtml } from "../../src/client/panel.js";

const f = (tab: "tasks" | "bugs", patch: Partial<TabFilterState> = {}): TabFilterState => ({ ...defaultTabFilter(tab), ...patch });

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

describe("buildOverviewQuery（状态筛选查询串）", () => {
  it("默认视图：tasks 未关闭走 filter（本服务端 browse-type 无效），bugs 未关闭走 browse", () => {
    expect(buildOverviewQuery(defaultTabFilter("tasks"), defaultTabFilter("bugs")))
      .toBe("taskFilter=status!%3Dclosed&bugBrowse=unclosed");
  });

  it("任务状态明细：filter status=doing；全部：不带参数", () => {
    expect(buildOverviewQuery(f("tasks", { status: "doing" }), defaultTabFilter("bugs")))
      .toBe("taskFilter=status%3Ddoing&bugBrowse=unclosed");
    expect(buildOverviewQuery(f("tasks", { status: "all" }), f("bugs", { status: "all" })))
      .toBe("bugBrowse=all");
  });

  it("优先级与状态条件合并为一个逗号 AND 表达式", () => {
    expect(buildOverviewQuery(f("tasks", { status: "doing", pri: "1" }), defaultTabFilter("bugs")))
      .toBe("taskFilter=status%3Ddoing%2Cpri%3D1&bugBrowse=unclosed");
    // 状态为「全部」（无 filter）时 pri 单独成条件
    expect(buildOverviewQuery(f("tasks", { status: "all", pri: "2" }), f("bugs", { status: "all" })))
      .toBe("taskFilter=pri%3D2&bugBrowse=all");
  });

  it("严重程度仅对 Bug 视图生效，且与状态条件合并", () => {
    expect(buildOverviewQuery(defaultTabFilter("tasks"), f("bugs", { status: "active", severity: "2" })))
      .toBe("taskFilter=status!%3Dclosed&bugBrowse=all&bugFilter=status%3Dactive%2Cseverity%3D2");
    // tasks 的 severity 被忽略
    expect(buildOverviewQuery(f("tasks", { severity: "2" }), f("bugs", { status: "all" })))
      .toBe("taskFilter=status!%3Dclosed&bugBrowse=all");
  });

  it("关键词编码进 taskSearch/bugSearch；空白忽略", () => {
    expect(buildOverviewQuery(f("tasks", { search: "登录" }), defaultTabFilter("bugs")))
      .toBe("taskFilter=status!%3Dclosed&taskSearch=%E7%99%BB%E5%BD%95&bugBrowse=unclosed");
    expect(buildOverviewQuery(f("tasks", { search: "  " }), defaultTabFilter("bugs")))
      .toBe("taskFilter=status!%3Dclosed&bugBrowse=unclosed");
  });

  it("未知状态 key 回退到默认项", () => {
    expect(buildOverviewQuery(f("tasks", { status: "nope" }), defaultTabFilter("bugs")))
      .toBe("taskFilter=status!%3Dclosed&bugBrowse=unclosed");
  });

  it("选项定义完整性：默认 key 必须存在于选项中", () => {
    expect(FILTER_OPTIONS.tasks.some((o) => o.key === DEFAULT_FILTER_KEY.tasks)).toBe(true);
    expect(FILTER_OPTIONS.bugs.some((o) => o.key === DEFAULT_FILTER_KEY.bugs)).toBe(true);
    // bugs 的状态明细项必须同时带 browse=all（避免与服务端默认状态集相交导致空结果）
    for (const o of FILTER_OPTIONS.bugs) {
      if (o.filter !== undefined) expect(o.browse).toBe("all");
    }
    // tasks 不使用 browse-type（本服务端对它静默忽略）
    for (const o of FILTER_OPTIONS.tasks) {
      expect(o.browse).toBeUndefined();
    }
  });
});

describe("sanitizeAndFormatHtml", () => {
  it("支持将 Markdown 格式图片转换为插件同源图片代理标签", () => {
    const input = "\\[步骤\\]\n\n测试步骤\n\n\\[结果\\]\n\n失败截图\n\n![file-read-11561.png]({11561.png})\n\n\\[期望\\]\n\n正常通过";
    const out = sanitizeAndFormatHtml(input);
    expect(out).toContain('<img src="/__dsh-zentao__/file?id=11561" alt="file-read-11561.png" />');
    expect(out).toContain("[步骤]");
    expect(out).toContain("[结果]");
    expect(out).toContain("[期望]");
    expect(out).not.toContain("\\[步骤\\]");
  });

  it("支持 HTML 格式的图片 src 替换", () => {
    const html = '<p>截图如下：<img src="{11587.png}" /></p>';
    const out = sanitizeAndFormatHtml(html);
    expect(out).toContain('src="/__dsh-zentao__/file?id=11587"');
  });

  it("过滤 script 和 iframe 高危标签", () => {
    const dirty = '<script>alert(1)</script><p>正文</p><iframe src="evil.com"></iframe>';
    const out = sanitizeAndFormatHtml(dirty);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("正文");
  });
});
