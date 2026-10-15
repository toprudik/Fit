import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * docs/design/tokens.json is the contract for CSS variable names and values (CLAUDE.md, ADR 0010);
 * globals.css is its hand-written mirror. This test fails as soon as the two drift apart.
 */

type ThemedValue = { dark: string; light: string };
type Token<V = string> = { name: string; value: V };
type TypeStyle = { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string };
type Tokens = {
  color: { themes: { id: string }[]; tokens: Token<ThemedValue>[] };
  type: { groups: { styles: TypeStyle[] }[] };
  shadow: { tokens: Token<ThemedValue>[] };
} & Record<"spacing" | "radius" | "size" | "duration" | "easing" | "opacity" | "zIndex", { tokens: Token[] }>;

const root = resolve(__dirname, "../..");
const tokens: Tokens = JSON.parse(readFileSync(resolve(root, "../../docs/design/tokens.json"), "utf8"));
const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");

/** Top-level blocks of the stylesheet: selector or at-rule prelude → custom properties declared directly inside. */
function parseBlocks(source: string): Map<string, Map<string, string>> {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = new Map<string, Map<string, string>>();
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      if (depth === 0) {
        prelude = text.slice(start, i).replace(/^[\s\S]*;/, "").replace(/\s+/g, " ").trim();
        start = i + 1;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        const body = text.slice(start, i);
        // Only declarations at the block's own level; nested rules (e.g. @layer base) are skipped.
        const flat = body.replace(/\{[^{}]*\}/g, "");
        const declarations = blocks.get(prelude) ?? new Map<string, string>();
        for (const [, name, value] of flat.matchAll(/(--[\w-]+\*?)\s*:\s*([^;]+);/g)) {
          declarations.set(name, value.replace(/\s+/g, " ").trim());
        }
        blocks.set(prelude, declarations);
        start = i + 1;
      }
    }
  }
  return blocks;
}

const blocks = parseBlocks(css);
const block = (prelude: string) => {
  const found = blocks.get(prelude);
  if (!found) throw new Error(`globals.css has no top-level "${prelude} { … }" block`);
  return found;
};

const THEME_BLOCKS = { dark: ':root, :root[data-theme="dark"]', light: ':root[data-theme="light"]' } as const;
const themes = Object.keys(THEME_BLOCKS) as (keyof typeof THEME_BLOCKS)[];

/** "{ink}" in tokens.json is a reference to another token, written var(--ink) in CSS. */
const toCss = (value: string) => value.replace(/^\{([\w-]+)\}$/, "var(--$1)");

/** Theme-independent tokens may sit in :root or, for Tailwind-generated utilities, in @theme static. */
const shared = new Map([...block(":root"), ...block("@theme static")]);

describe("tokens.json", () => {
  it("defines the dark and light themes", () => {
    expect(tokens.color.themes.map((theme) => theme.id).sort()).toEqual(["dark", "light"]);
  });
});

describe.each(themes)("globals.css, %s theme", (theme) => {
  const declared = block(THEME_BLOCKS[theme]);
  const themed = [...tokens.color.tokens, ...tokens.shadow.tokens];

  it.each(themed.map((token) => [token.name, toCss(token.value[theme])]))("--%s is %s", (name, value) => {
    expect(declared.get(`--${name}`)).toBe(value);
  });

  it("declares nothing beyond the tokens", () => {
    const names = new Set(themed.map((token) => `--${token.name}`));
    expect([...declared.keys()].filter((name) => !names.has(name))).toEqual([]);
  });
});

describe("globals.css, shared tokens", () => {
  const groups = ["spacing", "radius", "size", "duration", "easing", "opacity", "zIndex"] as const;
  const cases = groups.flatMap((group) => tokens[group].tokens.map((token) => [group, token.name, token.value] as const));

  it.each(cases)("%s --%s is %s", (_group, name, value) => {
    expect(shared.get(`--${name}`)).toBe(value);
  });

  it("does not let theme blocks override shared tokens", () => {
    const names = cases.map(([, name]) => `--${name}`);
    for (const theme of themes) expect(names.filter((name) => block(THEME_BLOCKS[theme]).has(name)), theme).toEqual([]);
  });
});

describe("globals.css, type styles", () => {
  const styles = tokens.type.groups.flatMap((group) => group.styles);
  const theme = block("@theme static");

  it.each(styles.map((style) => [style.name, style]))("text-%s", (name, style) => {
    const prefix = `--text-${name}`;
    expect({
      size: theme.get(prefix),
      lineHeight: theme.get(`${prefix}--line-height`),
      weight: theme.get(`${prefix}--font-weight`),
      tracking: theme.get(`${prefix}--letter-spacing`),
    }).toEqual({
      size: style.fontSize,
      lineHeight: style.lineHeight,
      weight: String(style.fontWeight),
      tracking: style.letterSpacing,
    });
  });

  it("has no text styles beyond the tokens", () => {
    const names = new Set(styles.map((style) => style.name));
    const extra = [...theme.keys()].filter((key) => key.startsWith("--text-") && !names.has(key.slice(7).split("--")[0]));
    expect(extra).toEqual([]);
  });
});

describe("globals.css, Tailwind colors", () => {
  const colors = block("@theme inline");

  it.each(tokens.color.tokens.map((token) => token.name))("bg-%s / text-%s maps to the token", (name) => {
    expect(colors.get(`--color-${name}`)).toBe(`var(--${name})`);
  });

  it("removes the default palette", () => {
    expect(block("@theme").get("--color-*")).toBe("initial");
  });
});
