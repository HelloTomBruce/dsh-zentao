import { describe, it, expect } from "vitest";
import { buildOverviewQuery, DEFAULT_FILTER_KEY, defaultTabFilter, FILTER_OPTIONS, normalizeOverview, openRowCount, type OverviewRow, type TabFilterState } from "../../src/client/overview.js";
import { sanitizeAndFormatHtml } from "../../src/client/panel.js";

const f = (tab: "tasks" | "bugs", patch: Partial<TabFilterState> = {}): TabFilterState => ({ ...defaultTabFilter(tab), ...patch });

describe("openRowCount", () => {
  it("统计非 closed 行数（标题栏未关闭 Bug 徽标用）", () => {
    const rows: OverviewRow[] = [
      { id: 1, title: "B1", status: "active" },
      { id: 2, title: "B2", status: "closed" },
      { id: 3, title: "B3", status: "resolved" },
    ];
    expect(openRowCount(rows)).toBe(2);
    expect(openRowCount([{ id: 1, title: "B", status: "closed" }])).toBe(0);
  });
});

describe("buildOverviewQuery（单视图筛选查询串）", () => {
  it("默认视图：tasks 未关闭走 filter（本服务端 browse-type 无效），bugs 未关闭走 browse", () => {
    expect(buildOverviewQuery("tasks", defaultTabFilter("tasks"))).toBe("filter=status!%3Dclosed");
    expect(buildOverviewQuery("bugs", defaultTabFilter("bugs"))).toBe("browse=unclosed");
  });

  it("任务状态明细：filter status=doing；全部：不带参数", () => {
    expect(buildOverviewQuery("tasks", f("tasks", { status: "doing" }))).toBe("filter=status%3Ddoing");
    expect(buildOverviewQuery("tasks", f("tasks", { status: "all" }))).toBe("");
  });

  it("优先级与状态条件合并为一个逗号 AND 表达式", () => {
    expect(buildOverviewQuery("tasks", f("tasks", { status: "doing", pri: "1" })))
      .toBe("filter=status%3Ddoing%2Cpri%3D1");
    // 状态为「全部」（无 filter）时 pri 单独成条件
    expect(buildOverviewQuery("tasks", f("tasks", { status: "all", pri: "2" })))
      .toBe("filter=pri%3D2");
  });

  it("严重程度仅对 Bug 视图生效，且与状态条件合并", () => {
    expect(buildOverviewQuery("bugs", f("bugs", { status: "active", severity: "2" })))
      .toBe("browse=all&filter=status%3Dactive%2Cseverity%3D2");
    // tasks 的 severity 被忽略
    expect(buildOverviewQuery("tasks", f("tasks", { severity: "2" }))).toBe("filter=status!%3Dclosed");
  });

  it("关键词编码进 search；空白忽略", () => {
    expect(buildOverviewQuery("tasks", f("tasks", { search: "登录" })))
      .toBe("filter=status!%3Dclosed&search=%E7%99%BB%E5%BD%95");
    expect(buildOverviewQuery("tasks", f("tasks", { search: "  " }))).toBe("filter=status!%3Dclosed");
  });

  it("未知状态 key 回退到默认项", () => {
    expect(buildOverviewQuery("tasks", f("tasks", { status: "nope" }))).toBe("filter=status!%3Dclosed");
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

describe("normalizeOverview（旧格式兼容垫片）", () => {
  it("新格式（带 view）原样透传", () => {
    const fresh = { view: "tasks", rows: [{ id: 1, name: "A", status: "wait" }] };
    expect(normalizeOverview(fresh, "tasks")).toBe(fresh);
  });

  it("旧格式 {tasks, bugs} 映射为单视图（tasks 取 tasks / bugs 取 bugs）", () => {
    const legacy = { tasks: [{ id: 1, name: "A", status: "wait" }], bugs: [{ id: 9, title: "B", status: "active" }], config: { product: 2 } };
    expect(normalizeOverview(legacy, "tasks")).toMatchObject({ view: "tasks", rows: [{ id: 1, name: "A" }] });
    expect(normalizeOverview(legacy, "bugs")).toMatchObject({ view: "bugs", rows: [{ id: 9, title: "B" }] });
  });

  it("旧服务端上没有的新视图映射为空行", () => {
    expect(normalizeOverview({ tasks: [], bugs: [] }, "stories")).toMatchObject({ view: "stories", rows: [] });
  });

  it("非对象响应返回格式异常错误", () => {
    expect(normalizeOverview("oops", "tasks")).toMatchObject({ error: "响应格式异常" });
  });
});

describe("sanitizeAndFormatHtml — fileID 查询参数形态（真实部署样本）", () => {
  it("重写 index.php?m=file&f=read&fileID=<id> 相对路径为代理地址", () => {
    const html = '<p>[结果]</p><img onload="setImageSize(this,0)" src="/zentao/zentao/index.php?m=file&amp;f=read&amp;t=png&amp;fileID=11870" alt="file-read-11870.png" />';
    const out = sanitizeAndFormatHtml(html);
    expect(out).toContain('src="/__dsh-zentao__/file?id=11870"');
    expect(out).not.toContain("index.php");
  });

  it("未转义 & 的形态同样重写", () => {
    const html = '<img src="/zentao/index.php?m=file&f=read&t=png&fileID=999" />';
    expect(sanitizeAndFormatHtml(html)).toContain('src="/__dsh-zentao__/file?id=999"');
  });
});
