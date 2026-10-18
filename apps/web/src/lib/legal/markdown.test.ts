import { describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdown, slugify } from "./markdown";

describe("parseInline", () => {
  it("reads bold, italics, code and links", () => {
    expect(parseInline("a **b** _c_ `d` [e](f.md)")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "c" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "d" },
      { kind: "text", text: " " },
      { kind: "link", href: "f.md", children: [{ kind: "text", text: "e" }] },
    ]);
  });

  it("leaves underscores and asterisks inside words alone", () => {
    expect(parseInline("sb-<ref>-auth_token and 2*3*4")).toEqual([{ kind: "text", text: "sb-<ref>-auth_token and 2*3*4" }]);
  });

  it("rewrites links", () => {
    const [node] = parseInline("[x](privacy-policy.md)", (href) => `/legal/${href}`);
    expect(node).toEqual({ kind: "link", href: "/legal/privacy-policy.md", children: [{ kind: "text", text: "x" }] });
  });

  it("keeps HTML as text", () => {
    expect(inlineText(parseInline("<script>alert(1)</script>"))).toBe("<script>alert(1)</script>");
  });
});

describe("slugify", () => {
  it("keeps letters and digits of any script", () => {
    expect(slugify("5. Права субъекта")).toBe("5-права-субъекта");
    expect(slugify("Who sees what?")).toBe("who-sees-what");
  });
});

describe("parseMarkdown", () => {
  const source = [
    "# Политика",
    "",
    "> **Черновик.** Проверит юрист.",
    "",
    "> Юристу: проверить ст. 12.",
    "> и ст. 18.",
    "",
    "## 1. Общее",
    "Первая строка",
    "вторая строка.",
    "",
    "- раз",
    "- два",
    "  продолжение",
    "",
    "1. первый",
    "2. второй",
    "",
    "| Имя | Срок |",
    "|---|:---:|",
    "| dafit-theme | 1 год |",
    "",
    "---",
    "## 1. Общее",
  ].join("\n");

  it("parses headings, quotes, paragraphs, lists, tables and rules", () => {
    const blocks = parseMarkdown(source);
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "quote",
      "quote",
      "heading",
      "paragraph",
      "list",
      "list",
      "table",
      "rule",
      "heading",
    ]);
    expect(blocks[4]).toEqual({ kind: "paragraph", children: [{ kind: "text", text: "Первая строка вторая строка." }] });
    expect(blocks[5]).toMatchObject({ kind: "list", ordered: false, items: [[{ text: "раз" }], [{ text: "два продолжение" }]] });
    expect(blocks[6]).toMatchObject({ kind: "list", ordered: true });
    expect(blocks[7]).toMatchObject({ kind: "table", header: [[{ text: "Имя" }], [{ text: "Срок" }]], rows: [[[{ text: "dafit-theme" }], [{ text: "1 год" }]]] });
  });

  it("gives repeated headings distinct anchors", () => {
    const ids = parseMarkdown(source).flatMap((block) => (block.kind === "heading" ? [block.id] : []));
    expect(ids).toEqual(["политика", "1-общее", "1-общее-1"]);
  });

  it("drops the notes for the lawyer, bold or not, and keeps other quotes", () => {
    const blocks = parseMarkdown(`${source}\n\n> **Counsel:** check.`, { dropQuotes: ["Юристу:", "Counsel:"] });
    const quotes = blocks.filter((block) => block.kind === "quote");
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ paragraphs: [[{ kind: "strong" }, { text: " Проверит юрист." }]] });
  });

  it("ends on any input", () => {
    for (const text of ["|", "| a |", "#", "####### x", ">", "1.", "-", "***", "* * *"]) {
      expect(() => parseMarkdown(text)).not.toThrow();
    }
  });
});
