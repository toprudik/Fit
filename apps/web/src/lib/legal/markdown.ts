/**
 * The small Markdown subset the legal documents use (src/content/legal): headings, paragraphs, lists,
 * quotes, tables and rules, with bold, italics, code and links inline. Parsed into plain data so the
 * page renders React elements and never injects HTML.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; id: string; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; paragraphs: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\p{L}\p{N}])[*_](?![\s*_])(.+?)(?<![\s*_])[*_](?![\p{L}\p{N}])/u;

/** Inline Markdown into nodes. `link` rewrites each href (sibling documents become app routes). */
export function parseInline(source: string, link: (href: string) => string = (href) => href): Inline[] {
  const nodes: Inline[] = [];
  let rest = source;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push({ kind: "text", text: rest });
      break;
    }
    if (match.index > 0) nodes.push({ kind: "text", text: rest.slice(0, match.index) });
    const [whole, strong, code, linkText, href, em] = match;
    if (strong !== undefined) nodes.push({ kind: "strong", children: parseInline(strong, link) });
    else if (code !== undefined) nodes.push({ kind: "code", text: code });
    else if (linkText !== undefined && href !== undefined) {
      nodes.push({ kind: "link", href: link(href), children: parseInline(linkText, link) });
    } else if (em !== undefined) nodes.push({ kind: "em", children: parseInline(em, link) });
    rest = rest.slice(match.index + whole.length);
  }
  return nodes;
}

/** Plain text of nodes, for heading anchors. */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((node) => (node.kind === "text" || node.kind === "code" ? node.text : inlineText(node.children))).join("");
}

/** An anchor for a heading: "## 3. Права" → "3-права". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableDivider = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export type ParseOptions = {
  link?: (href: string) => string;
  /** Quotes whose first line starts with one of these are dropped (notes for the lawyer). */
  dropQuotes?: readonly string[];
};

/**
 * Drops each section whose level-2 heading matches, up to the next level-2 heading. The drafts keep
 * notes for the team in a "## 0. …" section that is not part of the text a reader sees.
 */
export function dropSections(blocks: Block[], matches: (heading: string) => boolean): Block[] {
  let dropping = false;
  return blocks.filter((block) => {
    if (block.kind === "heading" && block.level <= 2) dropping = block.level === 2 && matches(inlineText(block.children));
    return !dropping;
  });
}

/** Block Markdown into blocks. */
export function parseMarkdown(source: string, options: ParseOptions = {}): Block[] {
  const link = options.link ?? ((href: string) => href);
  const inline = (text: string) => parseInline(text, link);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      const children = inline(heading[2]);
      const base = slugify(inlineText(children)) || "section";
      const seen = usedIds.get(base) ?? 0;
      usedIds.set(base, seen + 1);
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3 | 4, id: seen ? `${base}-${seen}` : base, children });
      i += 1;
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoted.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      const first = quoted.find((text) => text.trim()) ?? "";
      const lead = first.trim().replace(/^[*_]+/, "");
      if (options.dropQuotes?.some((prefix) => lead.startsWith(prefix))) continue;
      const paragraphs = quoted
        .join("\n")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/\n/g, " ").trim())
        .filter(Boolean)
        .map(inline);
      blocks.push({ kind: "quote", paragraphs });
      continue;
    }

    if (line.trimStart().startsWith("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = tableCells(line).map(inline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        rows.push(tableCells(lines[i]).map(inline));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const next = LIST_ITEM.exec(lines[i]);
        if (next && (next[2] !== undefined) === ordered) items.push(next[3]);
        else if (!next && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items: items.map(inline) });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">") &&
      !LIST_ITEM.test(lines[i]) &&
      !(lines[i].trimStart().startsWith("|") && i + 1 < lines.length && isTableDivider(lines[i + 1]))
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", children: inline(paragraph.join(" ")) });
  }
  return blocks;
}
