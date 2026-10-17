import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * motion/react re-exports the full `motion` component, and the bundler keeps all of it (about 40 KB gzip)
 * in the first JS of any page that imports anything from it. Only the sheet's panel imports it, and the
 * sheet loads that file after the first render (components/ui/sheet.tsx). Other animations use motion/mini,
 * the small WAAPI animate().
 */
describe("motion imports", () => {
  it("only the lazily loaded sheet panel imports motion/react", () => {
    const importers = sourceFiles(SRC)
      .filter((file) => /^import\s+(?!type\b)[^;]*from\s*"(?:motion\/react|motion|framer-motion)"/m.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(importers).toEqual([join("components", "ui", "sheet-panel.tsx")]);
  });

  it("the sheet panel is imported only dynamically", () => {
    const staticImporters = sourceFiles(SRC)
      .filter((file) => /^import\s+(?!type\b)[^;]*from\s*"(?:\.\/|@\/components\/ui\/)sheet-panel"/m.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(staticImporters).toEqual([]);
  });
});
