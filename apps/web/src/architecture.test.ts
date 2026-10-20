import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture rules of apps/web, checked on the source text so a break fails `npm test` in seconds instead of
 * surfacing as a build error, a leaked secret or a slow page later. Each rule names where it comes from:
 * CLAUDE.md, an ADR or docs/architecture. Type-only imports are ignored everywhere: they vanish at build time.
 */

const SRC = resolve(__dirname);
const rel = (file: string) => relative(SRC, file).split(sep).join("/");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const files = sourceFiles(SRC);
const text = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const source = (file: string) => text.get(file) ?? readFileSync(file, "utf8");

/** Module specifiers of the file's value imports and re-exports, `import "x"` included; `import type` left out. */
function specifiers(file: string): string[] {
  const out: string[] = [];
  for (const match of source(file).matchAll(/^(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
    // `import { type A, type B } from "x"` imports nothing at run time either.
    const clause = match[0].match(/\{([^}]*)\}/)?.[1];
    const names = clause?.split(",").map((name) => name.trim()).filter(Boolean);
    if (names?.length && names.every((name) => name.startsWith("type ")) && !/^\s*(?:import|export)\s+\w+\s*,/.test(match[0])) continue;
    out.push(match[1]);
  }
  return out;
}

function resolveImport(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(from, "..", spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Local files each file imports at run time. */
const graph = new Map(files.map((file) => [file, specifiers(file).map((spec) => resolveImport(spec, file)).filter((f): f is string => f !== null)]));

const isClient = (file: string) => /^\s*["']use client["']/.test(source(file));
/** Server actions: a client file imports only references to them, so their own imports stay on the server. */
const isServerActions = (file: string) => /^\s*["']use server["']/.test(source(file));
const isServerOnly = (file: string) => /^import\s+["']server-only["']/m.test(source(file));

describe("import graph", () => {
  it("has no cycles between local modules", () => {
    // A cycle makes import order decide what is undefined at module load, and Turbopack cannot split it into chunks.
    let index = 0;
    const order = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const cycles: string[][] = [];
    const visit = (file: string) => {
      order.set(file, index);
      low.set(file, index++);
      stack.push(file);
      onStack.add(file);
      for (const next of graph.get(file) ?? []) {
        if (!order.has(next)) {
          visit(next);
          low.set(file, Math.min(low.get(file)!, low.get(next)!));
        } else if (onStack.has(next)) low.set(file, Math.min(low.get(file)!, order.get(next)!));
      }
      if (low.get(file) === order.get(file)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(rel(member));
        } while (member !== file);
        if (component.length > 1 || (graph.get(file) ?? []).includes(file)) cycles.push(component.sort());
      }
    };
    for (const file of files) if (!order.has(file)) visit(file);
    expect(cycles).toEqual([]);
  });

  it("never reaches server-only code from a client file", () => {
    // ADR 0002: secrets and the secret-key client stay on the server. Next fails the build for `server-only` in a
    // client bundle; this says which client file pulled it in, and also catches next/headers and the env module.
    const serverModules = /^(?:server-only|next\/headers|@\/env\/server|@\/lib\/supabase\/(?:admin|server))$/;
    const problems: string[] = [];
    for (const file of files.filter(isClient)) {
      const seen = new Set<string>();
      const walk = (current: string, path: string[]) => {
        if (seen.has(current) || isServerActions(current)) return;
        seen.add(current);
        const bad = specifiers(current).find((spec) => serverModules.test(spec));
        if (bad && current !== file && !isClient(current)) problems.push(`${[...path, rel(current)].join(" → ")} imports ${bad}`);
        else if (bad && current === file) problems.push(`${rel(file)} imports ${bad}`);
        else if (current !== file && isServerOnly(current)) problems.push(`${[...path, rel(current)].join(" → ")} is server-only`);
        for (const next of graph.get(current) ?? []) walk(next, [...path, rel(current)]);
      };
      walk(file, []);
    }
    expect(problems).toEqual([]);
  });
});

describe("layers", () => {
  const importers = (pattern: RegExp, scope: (file: string) => boolean) =>
    files.filter(scope).flatMap((file) => specifiers(file).filter((spec) => pattern.test(spec)).map((spec) => `${rel(file)}: ${spec}`));

  it("nothing imports from app/: routes are leaves", () => {
    // Shared code lives in lib/ and components/; a page importing another route's file couples two screens.
    expect(importers(/^@\/app\//, () => true)).toEqual([]);
  });

  it("lib/ imports neither components/ nor app/", () => {
    expect(importers(/^@\/(?:components|app)\//, (file) => rel(file).startsWith("lib/"))).toEqual([]);
  });

  it("components/ui stays free of product code", () => {
    // The design system (docs/design.md) knows Telegram haptics, motion tokens and its own strings, not trainers or bookings.
    const allowed = /^@\/(?:components\/ui\/|lib\/(?:utils|motion|use-media-query|use-hydrated|telegram\/mini-app)$|i18n\/client$)/;
    const problems = files
      .filter((file) => rel(file).startsWith("components/ui/"))
      .flatMap((file) => specifiers(file).filter((spec) => spec.startsWith("@/") && !allowed.test(spec)).map((spec) => `${rel(file)}: ${spec}`));
    expect(problems).toEqual([]);
  });
});

describe("data access", () => {
  it("uses the secret-key client only in the files that need it", () => {
    // CLAUDE.md, ADR 0002: lib/supabase/admin bypasses RLS and never serves a user's data. Adding a file here is a
    // decision for review: say in the PR why RLS (lib/supabase/server) cannot do the job.
    const users = files.filter((file) => specifiers(file).some((spec) => /^@\/lib\/supabase\/admin$|\/supabase\/admin$|^\.\/admin$/.test(spec)));
    expect(users.map(rel).sort()).toEqual([
      "app/api/calendar/[token]/route.ts",
      "app/api/cron/notifications/route.ts",
      "app/api/cron/privacy/route.ts",
      "app/api/ingest/steps/route.ts",
      "lib/admin/user-actions.ts",
      "lib/attribution/record.ts",
      "lib/auth/sign-in-with-telegram.ts",
      "lib/bot-actions/act-as.ts",
      "lib/contact/actions.ts",
      "lib/feedback/github.ts",
      "lib/nutrition/foods.ts",
      "lib/rate-limit.ts",
    ]);
  });

  it("lists the columns of tables that hide some by grant", () => {
    // CLAUDE.md: select("*") fails with 42501 on these for a signed-in user. lib/account/export.ts reads with the
    // secret key, where every column is granted.
    const hidden = /\.from\(\s*["'](?:profiles|sessions|recurrences|trainer_invites|calendar_feeds)["']\s*\)\s*\.select\(\s*(?:["']\*["'])?\s*[,)]/;
    const problems = files.filter((file) => hidden.test(source(file).replace(/\s+/g, " "))).map(rel);
    expect(problems).toEqual([]);
  });

  it("reads secret environment variables only through src/env/server.ts", () => {
    // ADR 0002. Public values (NEXT_PUBLIC_*) and the variables Node and Next set themselves may be read anywhere.
    const problems = files
      .filter((file) => !rel(file).startsWith("env/"))
      .flatMap((file) =>
        [...source(file).matchAll(/process\.env(?:\.([A-Za-z_]\w*)|\[)/g)]
          .filter((m) => !m[1] || !/^(?:NEXT_PUBLIC_\w+|NODE_ENV|NEXT_RUNTIME)$/.test(m[1]))
          .map((m) => `${rel(file)}: ${m[0]}`),
      );
    expect(problems).toEqual([]);
  });

  it("never trusts initDataUnsafe", () => {
    // ADR 0004: only initData verified on the server says who the user is.
    expect(files.filter((file) => /initDataUnsafe/.test(source(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))).map(rel)).toEqual([]);
  });
});

describe("locale", () => {
  it("never puts the locale in a link", () => {
    // ADR 0015: the proxy adds the locale; a hard-coded /ru/ or /en/ path pins one language for everyone.
    const pattern = /["'`]\/(?:ru|en)(?:\/[^"'`]*)?["'`]/;
    const problems = files
      .filter((file) => !rel(file).startsWith("i18n/") && rel(file) !== "proxy.ts")
      .filter((file) => pattern.test(source(file).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")))
      .map(rel);
    expect(problems).toEqual([]);
  });
});
