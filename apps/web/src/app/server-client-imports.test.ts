import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A Server Component may render components from a "use client" file but cannot call its functions:
// Next throws at request time ("Attempted to call foodSubtitle() from the server"). Components are
// PascalCase, so a lowercase value import from a client file into a server file is the mistake.

const SRC = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const isClient = (source: string) => /^\s*["']use client["']/.test(source);

function resolveAlias(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(from, "..", spec) : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe("server files", () => {
  it("call no functions from client files", () => {
    const problems: string[] = [];
    for (const file of files(join(SRC, "app"))) {
      const source = readFileSync(file, "utf8");
      if (isClient(source)) continue;
      for (const match of source.matchAll(/^import\s+(?!type\b)\{([^}]+)\}\s+from\s+"([^"]+)"/gm)) {
        const target = resolveAlias(match[2], file);
        if (!target || !isClient(readFileSync(target, "utf8"))) continue;
        const names = match[1]
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith("type "))
          .map((name) => name.split(/\s+as\s+/)[0]);
        for (const name of names.filter((name) => /^[a-z]/.test(name))) problems.push(`${file.slice(SRC.length)}: ${name} from ${match[2]}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
