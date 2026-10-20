import { describe, it, expect } from "vitest";
import { overviewSummary, type OverviewResponse } from "../../src/client/overview.js";
import { sanitizeAndFormatHtml } from "../../src/client/panel.js";

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
