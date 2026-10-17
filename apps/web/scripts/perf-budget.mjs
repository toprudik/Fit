// First-load JS budget per page (docs/prd/quality.md §1), read from the output of `next build`, no browser.
// A page's first load is the root main files plus the client chunks of its layouts and the page itself, gzipped
// the way `next start` and Vercel serve them. The active language's catalog loads on top of that, so its largest
// chunk is added to every page. Usage: node scripts/perf-budget.mjs [--max-kb 400] [--top 10]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const MAX_KB = option("--max-kb", 400);
const TOP = option("--top", 10);

const NEXT = join(process.cwd(), ".next");
const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(join(NEXT, file))).length);
  return sizes.get(file);
};

function manifests(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return manifests(path);
    return name === "page_client-reference-manifest.js" ? [path] : [];
  });
}

const build = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8"));
const root = build.rootMainFiles;

// The catalog chunks: the biggest of them stands in for whichever language a visitor gets.
const chunks = join(NEXT, "static", "chunks");
const catalog = readdirSync(chunks)
  .filter((name) => name.endsWith(".js") && /\bappName:"/.test(readFileSync(join(chunks, name), "utf8")))
  .map((name) => `static/chunks/${name}`)
  .filter((file) => !root.includes(file));
const catalogBytes = catalog.length ? Math.max(...catalog.map(gz)) : 0;
if (!catalogBytes) throw new Error("No language catalog chunk found; update the catalog lookup in this script.");

const pages = manifests(join(NEXT, "server", "app")).map((path) => {
  const sandbox = { self: {}, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox);
  const store = sandbox.__RSC_MANIFEST ?? sandbox.self.__RSC_MANIFEST;
  const route = Object.keys(store)[0];
  const entries = store[route].entryJSFiles;
  const page = `[project]/src/app${route}`;
  const files = new Set(root);
  for (const [entry, list] of Object.entries(entries)) {
    const segment = entry.replace(/\/(layout|page)$/, "");
    if (entry === page || (entry.endsWith("/layout") && page.startsWith(`${segment}/`))) list.forEach((f) => files.add(f));
  }
  const bytes = [...files].reduce((sum, file) => sum + gz(file), 0) + catalogBytes;
  return { route: route.replace(/\/page$/, "").replace(/^\/\[lang\]/, "").replace(/\/\([^)]+\)/g, "") || "/", kb: Math.round(bytes / 1024), source: relative(NEXT, path) };
});

pages.sort((a, b) => b.kb - a.kb);
const over = pages.filter((p) => p.kb > MAX_KB);
console.log(`First-load JS, gzip (budget ${MAX_KB} KB, ${pages.length} pages):`);
for (const p of pages.slice(0, TOP)) console.log(`  ${String(p.kb).padStart(4)} KB  ${p.route}`);
if (over.length) {
  console.error(`\n${over.length} page(s) over ${MAX_KB} KB:`);
  for (const p of over) console.error(`  ${p.kb} KB  ${p.route}`);
  process.exit(1);
}
