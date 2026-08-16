import { describe, expect, it } from "vitest";
import { renderEmailHtml, rewriteHtmlLinks } from "../src/lib/emailHtml";

describe("email HTML renderer", () => {
  it("creates multipart-safe text and escaped HTML with paragraphs and pixel", () => {
    const rendered = renderEmailHtml("Hi {{firstName}}\nLine two\n\nVisit https://example.com", { firstName: "Alex" }, { pixelUrl: "https://app.test/pixel" });
    expect(rendered.text).toContain("Hi Alex");
    expect(rendered.html).toContain("Hi Alex");
    expect(rendered.html).toContain("<br />");
    expect(rendered.html).toContain("https://app.test/pixel");
    expect(rendered.html).toContain('href="https://example.com/"');
  });

  it("rewrites only http(s) href values through the supplied callback", () => {
    const result = rewriteHtmlLinks('<a href="https://example.com">A</a><a href="mailto:a@example.com">B</a>', (url, index) => `https://track.test/${index}?url=${encodeURIComponent(url)}`);
    expect(result).toContain("https://track.test/0");
    expect(result).toContain('href="mailto:a@example.com"');
  });
});
