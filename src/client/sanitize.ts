/**
 * 富文本消毒 + 排版（安全边界见 sanitizeAndFormatHtml 注释）。
 * 独立模块便于对安全敏感逻辑做针对性测试（tests/client/xss.test.ts）。
 */
import DOMPurify from "dompurify";
import { T } from "./theme.ts";

export /** HTML 转义（markdown 图片 alt/url 拼接进属性前必须转义）。 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 白名单消毒配置：ZenTao 富文本所需的最小标签/属性集；事件处理器与 data:* 全拒。 */
export const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "ol", "ul", "li", "table", "thead", "tbody", "tr", "td", "th", "img", "a", "hr", "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "font", "sup", "sub"],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan", "color"],
  ALLOW_DATA_ATTR: false,
};

/**
 * 富文本消毒 + 排版。安全边界：
 * ① DOMPurify 白名单消毒（剥事件处理器/javascript: 协议/未知标签，文本保留）
 * ② markdown 图片的 alt/url 拼接属性前经 escapeHtml
 * ③ 图片代理重写在消毒**之后**执行（产出 src 为本插件同源受控地址）
 */
export function sanitizeAndFormatHtml(text: string): string {
  if (!text) return "";
  let s = text;

  // 1. Markdown 图片 → img（alt/url 转义后再拼接，防属性逃逸）
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const idMatch = String(url).match(/(?:\{|file-(?:read|download)-)?(\d+)(?:\.[a-zA-Z0-9]+)?\}?/);
    const safeAlt = escapeHtml(alt || "图片");
    if (idMatch) return `<img src="/__dsh-zentao__/file?id=${idMatch[1]}" alt="${safeAlt}" />`;
    return `<img src="${escapeHtml(String(url))}" alt="${safeAlt}" />`;
  });

  // 2. DOMPurify 白名单消毒：剥 <script>/<iframe>/on* 事件处理器/javascript: 协议/
  //    未知标签（svg/math 等，文本内容保留）；必须先于代理重写执行
  s = DOMPurify.sanitize(s, PURIFY_CONFIG);

  // 3. 解除 markdown 转义的方括号（zentao CLI 的 turndown 转换会输出 \\[步骤\\]）
  s = s.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

  // 4. 图片代理重写（对消毒后的受控 HTML 执行）：
  //    {11587.png} / file-read-11587 / index.php?m=file&f=read&fileID=11870 → 同源代理
  s = s
    .replace(/src=["']\{(\d+)(?:\.[a-zA-Z0-9]+)?\}["']/gi, (_m, id) => `src="/__dsh-zentao__/file?id=${id}"`)
    .replace(/src=["'][^"']*file-(?:read|download)-(\d+)[^"']*["']/gi, (_m, id) => `src="/__dsh-zentao__/file?id=${id}"`)
    .replace(
      /src=["'][^"']*m=file(?:&amp;|&)f=read[^"']*fileID=(\d+)[^"']*["']/gi,
      (_m, id) => `src="/__dsh-zentao__/file?id=${id}"`,
    );

  // 5. 独立出现的 {11561.png} 或 {11561} 占位符（非 markdown、非 img 属性）
  s = s.replace(/(?:^|[^\w"'/])\{(\d+)(?:\.[a-zA-Z0-9]+)?\}(?:[^\w"'/]|$)/g, (_m, id) => {
    return `<img src="/__dsh-zentao__/file?id=${id}" alt="image-${id}" />`;
  });

  // 6. 段落排版与步骤高亮：
  // 若不含常见 HTML 块级标签，说明是 Markdown 或纯文本，将换行拆分为段落
  const hasHtmlBlocks = /<(?:p|div|br|ul|ol|li|table|tr|td|h[1-6])\b/i.test(s);
  if (!hasHtmlBlocks) {
    const paragraphs = s.split(/\r?\n\r?\n+/);
    s = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        const formatted = trimmed
          .replace(/\[(步骤|结果|期望|其它|其他)\]/g, `<strong style="color: ${T.accent}; display: block; margin: 6px 0 2px 0;">[$1]</strong>`)
          .replace(/\r?\n/g, "<br />");
        return `<p style="margin: 4px 0;">${formatted}</p>`;
      })
      .filter(Boolean)
      .join("");
  } else {
    s = s.replace(/\[(步骤|结果|期望|其它|其他)\]/g, `<strong style="color: ${T.accent}; display: block; margin: 6px 0 2px 0;">[$1]</strong>`);
  }

  return s;
}
