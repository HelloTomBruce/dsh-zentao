// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeAndFormatHtml } from "../../src/client/panel.js";

/** 对抗性用例：任何事件处理器 / javascript: / 未知标签都不得到达 innerHTML。 */
describe("sanitizeAndFormatHtml — XSS 对抗", () => {
  it("img onerror 事件处理器被剥除", () => {
    const out = sanitizeAndFormatHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).toContain("<img");
  });

  it("元素属性上的 onclick 被剥除", () => {
    const out = sanitizeAndFormatHtml('<p onclick="steal()">正文</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("正文");
  });

  it("javascript: 协议 href 被剥除", () => {
    const out = sanitizeAndFormatHtml('<a href="javascript:alert(2)">点我</a>');
    expect(out).not.toContain("javascript:");
  });

  it("data:text/html 协议被拒", () => {
    const out = sanitizeAndFormatHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toContain("data:text/html");
  });

  it("svg onload 被剥除（svg 标签本身不在白名单，内容保留）", () => {
    const out = sanitizeAndFormatHtml('<svg onload="alert(1)"><circle r="1"></circle></svg>');
    expect(out).not.toContain("onload");
    expect(out).not.toContain("<svg");
  });

  it("math 嵌套重组攻击（引号+script）被消毒", () => {
    const out = sanitizeAndFormatHtml('"><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)</script>");
  });

  it("iframe 被剥除", () => {
    const out = sanitizeAndFormatHtml('<iframe src="evil.com"></iframe>正文');
    expect(out).not.toContain("<iframe");
    expect(out).toContain("正文");
  });

  it("markdown 图片 alt 属性注入被转义", () => {
    const out = sanitizeAndFormatHtml('![x" onerror="alert(1)](http://evil/x.png)');
    expect(out).not.toContain('onerror="alert(1)"');
    expect(out).toContain("&quot;");
  });

  it("data:image/png 的 img src 保留（正常图片 data uri 合法）", () => {
    const out = sanitizeAndFormatHtml('<img src="data:image/png;base64,iVBOR">');
    expect(out).toContain("data:image/png");
  });
});

describe("sanitizeAndFormatHtml — 既有行为回归", () => {
  it("正常富文本（img/p/a/table）原样保留", () => {
    const html = '<p>见截图</p><img src="/zentao/index.php?m=file&amp;f=read&amp;fileID=11870"><table><tr><td>1</td></tr></table>';
    const out = sanitizeAndFormatHtml(html);
    expect(out).toContain('src="/__dsh-zentao__/file?id=11870"');
    expect(out).toContain("<table");
    expect(out).toContain("见截图");
  });

  it("https 外链 a 标签保留", () => {
    expect(sanitizeAndFormatHtml('<a href="https://example.com">链接</a>')).toContain('href="https://example.com"');
  });
});
