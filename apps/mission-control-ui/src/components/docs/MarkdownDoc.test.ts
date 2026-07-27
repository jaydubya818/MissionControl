import { describe, expect, it } from "vitest";
import { renderDocsMarkdown } from "../../lib/markdownRender";

describe("renderDocsMarkdown", () => {
  it("renders headings and lists", () => {
    const html = renderDocsMarkdown("# Title\n\n- one\n- two");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<li>one</li>");
  });

  it("renders tables", () => {
    const html = renderDocsMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("1");
  });

  it("escapes raw html in paragraphs", () => {
    const html = renderDocsMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
