import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/i18n/config";
import { ALL_LEGAL_SLUGS, isLegalPath, INTERNAL_NOTES, LEGAL_DOCUMENTS, legalFile, legalHref } from "./documents";
import { type Block, type Inline, parseMarkdown } from "./markdown";

const read = (locale: Locale, file: string) => readFileSync(join(process.cwd(), "src/content/legal", locale, file), "utf8");

function links(nodes: Inline[]): string[] {
  return nodes.flatMap((node) => (node.kind === "link" ? [node.href, ...links(node.children)] : "children" in node ? links(node.children) : []));
}

function blockLinks(block: Block): string[] {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return links(block.children);
    case "list":
      return block.items.flatMap(links);
    case "quote":
      return block.paragraphs.flatMap(links);
    case "table":
      return [...block.header, ...block.rows.flat()].flatMap(links);
    case "rule":
      return [];
  }
}

describe("legal documents", () => {
  it("has a file for every document", () => {
    for (const [locale, documents] of Object.entries(LEGAL_DOCUMENTS)) {
      for (const file of Object.values(documents)) {
        expect(existsSync(join(process.cwd(), "src/content/legal", locale, file)), `${locale}/${file}`).toBe(true);
      }
    }
  });

  it("starts every document with one title and the draft note, and hides the internal notes", () => {
    for (const [locale, documents] of Object.entries(LEGAL_DOCUMENTS) as [Locale, Record<string, string>][]) {
      for (const file of Object.values(documents)) {
        const blocks = parseMarkdown(read(locale, file), { dropQuotes: INTERNAL_NOTES });
        expect(blocks.filter((block) => block.kind === "heading" && block.level === 1), `${locale}/${file}`).toHaveLength(1);
        expect(blocks[1]?.kind, `${locale}/${file}`).toBe("quote");
        expect(JSON.stringify(blocks), `${locale}/${file}`).not.toMatch(/"text":"(Юристу|Counsel|Команде|Team):/);
      }
    }
  });

  it("links only to documents and sections that exist", () => {
    for (const [locale, documents] of Object.entries(LEGAL_DOCUMENTS) as [Locale, Record<string, string>][]) {
      const ids = new Map<string, Set<string>>();
      for (const [slug, file] of Object.entries(documents)) {
        const blocks = parseMarkdown(read(locale, file));
        ids.set(slug, new Set(blocks.flatMap((block) => (block.kind === "heading" ? [block.id] : []))));
      }
      for (const [slug, file] of Object.entries(documents)) {
        const hrefs = parseMarkdown(read(locale, file), { link: (href) => legalHref(locale, href) }).flatMap(blockLinks);
        for (const href of hrefs.filter((value) => value.startsWith("/legal/"))) {
          const [path, anchor] = href.split("#");
          const target = path.slice("/legal/".length);
          expect(ids.has(target), `${locale}/${slug} → ${href}`).toBe(true);
          if (anchor) expect(ids.get(target)?.has(decodeURIComponent(anchor)), `${locale}/${slug} → ${href}`).toBe(true);
        }
      }
    }
  });

  it("lists every slug once", () => {
    expect(new Set(ALL_LEGAL_SLUGS).size).toBe(ALL_LEGAL_SLUGS.length);
    expect(ALL_LEGAL_SLUGS).toContain("privacy");
  });

  it("finds a file only in the language that has it", () => {
    expect(legalFile("ru", "personal-data")).toBe("consent-personal-data.md");
    expect(legalFile("en", "personal-data")).toBeNull();
    expect(legalFile("ru", "toString")).toBeNull();
  });

  it("turns links between documents into routes in the same language", () => {
    expect(legalHref("ru", "privacy-policy.md")).toBe("/legal/privacy");
    expect(legalHref("en", "privacy-policy.md#7-your-rights")).toBe("/legal/privacy#7-your-rights");
    expect(legalHref("ru", "offer-paid-plans.md")).toBe("/legal");
    expect(legalHref("en", "https://gdpr-info.eu")).toBe("https://gdpr-info.eu");
  });

  it("knows its paths", () => {
    expect(isLegalPath("/legal")).toBe(true);
    expect(isLegalPath("/legal/terms")).toBe(true);
    expect(isLegalPath("/legalese")).toBe(false);
  });
});
