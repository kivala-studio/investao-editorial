import { parseDocument } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";

export const MAX_UPLOAD_BYTES = 256 * 1024;
export type ImportedSource = { name: string; url: string; primary: boolean };
export type ArticleImport = {
  body: string;
  title: string;
  summary: string;
  category: string;
  securities: string[];
  sources: ImportedSource[];
  warnings: string[];
};
export function safeURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
const supported = new Set([
  "root",
  "heading",
  "paragraph",
  "text",
  "strong",
  "emphasis",
  "link",
  "list",
  "listItem",
  "blockquote",
  "thematicBreak",
  "break",
]);
export function validateMarkdown(body: string): string[] {
  const warnings = new Set<string>();
  visit(unified().use(remarkParse).parse(body), (node, _index, parent) => {
    if (
      parent?.type === "blockquote" &&
      !["paragraph", "text"].includes(node.type)
    )
      warnings.add("Blockquotes may contain plain paragraphs only.");
    if (
      node.type === "listItem" &&
      "children" in node &&
      (node.children as { type: string }[]).some(
        (child) => child.type !== "paragraph",
      )
    )
      warnings.add("List items may contain plain paragraphs only.");
    if (
      node.type === "listItem" &&
      "children" in node &&
      (node.children as unknown[]).length > 1
    )
      warnings.add("Use one paragraph per list item.");
    if (!supported.has(node.type))
      warnings.add(
        `Unsupported Markdown: ${node.type}. Remove it before publishing.`,
      );
    if (node.type === "link" && "url" in node && !safeURL(String(node.url)))
      warnings.add("Links must use a complete http:// or https:// URL.");
    if (node.type === "listItem" && "children" in node) {
      if (
        (node.children as { type: string }[]).some(
          (child) => child.type === "list",
        )
      )
        warnings.add(
          "Nested lists are not supported. Use a single list level.",
        );
    }
  });
  return [...warnings];
}
function string(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string")
    throw new Error(`Front matter ${field} must be text.`);
  return value;
}
export function parseUpload(filename: string, input: string): ArticleImport {
  if (!/\.md$/i.test(filename)) throw new Error("Choose a .md file.");
  if (new TextEncoder().encode(input).length > MAX_UPLOAD_BYTES)
    throw new Error("The file must be 256 KB or smaller.");
  if (input.includes("\0")) throw new Error("The file contains invalid text.");
  let body = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let metadata: Record<string, unknown> = {};
  if (body.startsWith("---\n")) {
    const match = body.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!match)
      throw new Error("Front matter must end with a line containing --- .");
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length)
      throw new Error(`Invalid YAML: ${document.errors[0].message}`);
    const parsed: unknown = document.toJS({ maxAliasCount: 20 });
    if (
      parsed !== null &&
      (typeof parsed !== "object" || Array.isArray(parsed))
    )
      throw new Error("Front matter must be a metadata object.");
    metadata = (parsed ?? {}) as Record<string, unknown>;
    body = body.slice(match[0].length);
  }
  body = body.trim();
  if (!body) throw new Error("The Markdown body is empty.");
  const securities = metadata.securities ?? [];
  if (
    !Array.isArray(securities) ||
    securities.some((value) => typeof value !== "string")
  )
    throw new Error("Securities must be a list of symbols.");
  const sources = metadata.sources ?? [];
  if (!Array.isArray(sources)) throw new Error("Sources must be a list.");
  return {
    body: normalizeMarkdown(body),
    title: string(metadata.title, "title"),
    summary: string(metadata.summary, "summary"),
    category: string(metadata.category, "category"),
    securities,
    sources: sources.map((source: unknown) => {
      if (!source || typeof source !== "object")
        throw new Error("Each source needs a name and URL.");
      const value = source as Record<string, unknown>;
      if (value.primary !== undefined && typeof value.primary !== "boolean")
        throw new Error("Source primary must be true or false.");
      const url = string(value.url, "source URL");
      if (url && !safeURL(url))
        throw new Error("Source URLs must use http:// or https://.");
      return {
        name: string(value.name, "source name"),
        url,
        primary: value.primary === true,
      };
    }),
    warnings: validateMarkdown(body),
  };
}
export function publicationErrors(article: {
  title: string;
  summary: string;
  body_markdown: string;
  sources: { source_id: string; source_url: string }[];
}): string[] {
  const errors: string[] = [];
  if (!article.title.trim()) errors.push("Add a title.");
  if (!article.summary.trim()) errors.push("Add a summary.");
  if (!article.body_markdown.trim()) errors.push("Add the article body.");
  if (!article.sources.length) errors.push("Add at least one source.");
  if (
    article.sources.some(
      (source) => !source.source_id || !safeURL(source.source_url),
    )
  )
    errors.push("Every source needs a name and a valid URL.");
  return [...errors, ...validateMarkdown(article.body_markdown)];
}
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Canonicalize the allowed subset so the portal and native reader agree on blocks.
export function normalizeMarkdown(body: string): string {
  const processor = unified().use(remarkParse).use(remarkStringify, {
    bullet: "-",
    rule: "-",
    ruleRepetition: 3,
    emphasis: "*",
    strong: "*",
    listItemIndent: "one",
  });
  const tree = processor.parse(body);
  visit(tree, "break", (node, index, parent) => {
    if (parent && index !== undefined)
      parent.children[index] = { type: "text", value: " " };
  });
  visit(tree, "text", (node) => {
    node.value = node.value.replace(/\n/g, " ");
  });
  return processor.stringify(tree).trim();
}
