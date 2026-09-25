import { describe, it, expect } from "vitest";
import {
  parseUpload,
  publicationErrors,
  safeURL,
  MAX_UPLOAD_BYTES,
  validateMarkdown,
  normalizeMarkdown,
} from "./markdown";
describe("Markdown import", () => {
  it("imports optional YAML and normalizes Windows line endings", () => {
    const value = parseUpload(
      "story.md",
      "---\r\ntitle: BFA\r\nsummary: Summary\r\ncategory: Dividendos\r\nsecurities: [BFAAAAA]\r\nsources:\r\n  - name: BODIVA\r\n    url: https://bodiva.ao/notice\r\n    primary: true\r\n---\r\n## Pagamento\r\n\r\n**Texto**",
    );
    expect(value.title).toBe("BFA");
    expect(value.sources[0].primary).toBe(true);
    expect(value.warnings).toEqual([]);
    expect(value.body).toBe("## Pagamento\n\n**Texto**");
  });
  it("accepts plain Markdown and BOM", () =>
    expect(parseUpload("article.MD", "\uFEFF# Hello").body).toBe("# Hello"));
  it.each([
    ["article.txt", "Body"],
    ["article.md", ""],
    ["article.md", "---\ntitle: Hello"],
    ["article.md", "---\ntitle: [wrong]\n---\nBody"],
    ["article.md", "---\ntitle: first\ntitle: second\n---\nBody"],
    ["article.md", "\0binary"],
    ["article.md", "x".repeat(MAX_UPLOAD_BYTES + 1)],
  ])("rejects invalid upload %s", (name, body) =>
    expect(() => parseUpload(name, body)).toThrow(),
  );
  it("rejects dangerous links and HTML before publication", () => {
    expect(validateMarkdown("<script>alert(1)</script>")).not.toEqual([]);
    expect(validateMarkdown("[x](javascript:alert)")).not.toEqual([]);
    expect(validateMarkdown("![image](https://example.com/x.png)")).not.toEqual(
      [],
    );
  });
  it("rejects unsupported code and nested lists", () => {
    expect(validateMarkdown("```js\nalert(1)\n```")).not.toEqual([]);
    expect(validateMarkdown("- one\n  - two")).not.toEqual([]);
  });
  it("supports the native subset", () =>
    expect(
      validateMarkdown(
        "# Heading\n\n**Bold** and *italic* [link](https://example.com)\n\n1. One\n2. Two\n\n> Quote\n\n---",
      ),
    ).toEqual([]));
  it("validates publication metadata and sources", () => {
    expect(
      publicationErrors({
        title: " ",
        summary: "",
        body_markdown: "",
        sources: [],
      }),
    ).toHaveLength(4);
    expect(
      publicationErrors({
        title: "Title",
        summary: "Summary",
        body_markdown: "Body",
        sources: [{ source_id: "id", source_url: "https://example.com" }],
      }),
    ).toEqual([]);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "//example.com",
    "https://user:password@example.com",
  ])("rejects unsafe URL %s", (url) => expect(safeURL(url)).toBe(false));
});

describe("canonical native subset", () => {
  it("normalizes setext headings, soft wrapping and hard breaks", () => {
    expect(
      normalizeMarkdown("Heading\n=======\n\n- wrapped\n  item\n\nA  \nline"),
    ).toBe("# Heading\n\n- wrapped item\n\nA line");
  });
  it("warns on complex quote and list blocks", () => {
    expect(validateMarkdown("> ## Nested heading")).not.toEqual([]);
    expect(validateMarkdown("- First\n\n  Second paragraph")).not.toEqual([]);
  });
});
