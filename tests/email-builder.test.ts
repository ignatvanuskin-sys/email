import { describe, expect, it } from "vitest";
import { documentToHtml, isEmailDocument, renderDocumentText } from "../src/lib/emailBuilder";

const document = { version: 1 as const, blocks: [{ id: "h", type: "heading" as const, text: "Hello {{firstName}}", level: 1 as const }, { id: "b", type: "button" as const, text: "Open", url: "https://example.com" }, { id: "d", type: "divider" as const }] };

describe("structured email builder", () => {
  it("validates and renders text blocks", () => {
    expect(isEmailDocument(document)).toBe(true);
    expect(renderDocumentText(document, { firstName: "Alex" })).toContain("Hello Alex");
    expect(renderDocumentText(document, {})).toContain("Open: https://example.com");
  });

  it("renders safe HTML and allows link tracking", () => {
    const html = documentToHtml(document, { firstName: "<Alex>" }, (url, index) => `https://track.test/${index}?url=${encodeURIComponent(url)}`);
    expect(html).toContain("&lt;Alex&gt;");
    expect(html).toContain("https://track.test/0");
    expect(html).not.toContain("javascript:");
  });
});
