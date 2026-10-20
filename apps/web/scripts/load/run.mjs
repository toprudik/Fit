// Load run against the LOCAL stand only: `next start` of this checkout and the local Supabase (README.md here).
// Signs the seeded users in through the real Mini App sign-in, then keeps N virtual users busy per stage:
// clients open their screens and log food and water, trainers open theirs, one trainer has a big roster.
// Prints and writes a Markdown report; exits 1 when a target from docs/prd/quality.md (or below) is missed.
//
//   node scripts/load/run.mjs --app http://127.0.0.1:3200 --stages 10x30,25x30,50x30 --report report.md
//
// Zero dependencies: Node's fetch and crypto. Never point it at production or Telegram; the guard below
// refuses any host but localhost.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const APP = option("--app", "http://127.0.0.1:3200");
const STAGES = option("--stages", "10x30,25x30,50x30")
  .split(",")
  .map((stage) => {
    const [users, seconds] = stage.split("x").map(Number);
    return { users, seconds };
  });
const REPORT = option("--report", null);
// The same fake token the runner gave `next start` (run.sh); initData signed with it is what the app verifies.
const BOT_TOKEN = process.env.LOAD_BOT_TOKEN ?? "1:load-placeholder";
// A request slower than this counts as an error rather than holding its virtual user forever.
const TIMEOUT_MS = 30_000;
const SIGN_IN_CONCURRENCY = Number(option("--sign-in-concurrency", "8"));

// Targets. API reads: docs/prd/quality.md §1 (p95 ≤ 300 ms). Pages and sign-in have no number in the PRD;
// these are ours. Page times count only in the first stage: `next start` is one Node process, which one core
// saturates at about 25 virtual users here, while Vercel adds instances as requests grow. Beyond the first stage a
// page time measures this machine; database calls and errors count in every stage.
const TARGETS = {
  errorRate: 0.01,
  p95: { page: 1500, rpc: 300, write: 300, "sign-in": 2000 },
};

function localOnly(url) {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    console.error(`Refusing ${url}: load runs only against the local stand.`);
    process.exit(2);
  }
  return url;
}

localOnly(APP);
const supabase = Object.fromEntries(
  execFileSync("supabase", ["status", "-o", "env"], { cwd: new URL("../../../../", import.meta.url), encoding: "utf8" })
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = localOnly(supabase.API_URL);
const DB = supabase.DB_URL;
localOnly(DB.replace(/^postgresql:/, "http:"));

const users = execFileSync("psql", [DB, "-X", "-At", "-F", "\t", "-c", "select handle, telegram_id from load.users order by handle"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [handle, telegramId] = line.split("\t");
    return { handle, telegramId: Number(telegramId) };
  });
if (!users.length) {
  console.error("No load users: run scripts/load/seed.sql first.");
  process.exit(2);
}

/** Mini App initData for a seeded user, signed the way Telegram signs it (lib/telegram/init-data.ts verifies). */
function initData(user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `load-${user.telegramId}`,
    user: JSON.stringify({ id: user.telegramId, first_name: user.handle, language_code: "ru" }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

// ---------------------------------------------------------------------------------------------------------------
// Measurements: one list of durations per label and stage.

const samples = new Map();
function record(stage, kind, label, ms, ok, detail) {
  const key = `${stage}\u0000${kind}\u0000${label}`;
  if (!samples.has(key)) samples.set(key, { stage, kind, label, ms: [], errors: 0, details: new Map() });
  const s = samples.get(key);
  s.ms.push(ms);
  if (!ok) {
    s.errors += 1;
    s.details.set(detail, (s.details.get(detail) ?? 0) + 1);
  }
}

async function timed(stage, kind, label, run) {
  const start = performance.now();
  let ok = false;
  let detail = "";
  try {
    [ok, detail] = await run();
  } catch (error) {
    detail = error instanceof Error ? error.message.slice(0, 80) : "error";
  }
  record(stage, kind, label, performance.now() - start, ok, detail);
  return ok;
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

// ---------------------------------------------------------------------------------------------------------------
// Sign-in: the real route, so each user ends up with the session cookies the app itself sets.

function cookieJar(response) {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** The user's access token, read from the session cookie (@supabase/ssr: "base64-" + base64url JSON, maybe chunked). */
function accessToken(cookies) {
  const parts = cookies
    .split("; ")
    .filter((pair) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(pair))
    .sort()
    .map((pair) => pair.slice(pair.indexOf("=") + 1));
  const joined = parts.join("");
  const json = Buffer.from(joined.replace(/^base64-/, ""), "base64url").toString("utf8");
  return JSON.parse(json).access_token;
}

async function signIn(user) {
  let cookies = "";
  const ok = await timed("sign-in", "sign-in", "POST /api/auth/telegram/mini-app", async () => {
    const response = await fetch(`${APP}/api/auth/telegram/mini-app`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(APP).origin, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ initData: initData(user) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    cookies = cookieJar(response);
    return [response.ok && cookies.includes("-auth-token"), `HTTP ${response.status}`];
  });
  return ok ? { ...user, cookies, token: accessToken(cookies) } : null;
}

async function pool(items, size, work) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++];
        out.push(await work(item));
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// What a virtual user does in one iteration.

const CLIENT_PAGES = ["/client", "/client/diary", "/client/sessions", "/client/progress", "/client/passes"];
const TRAINER_PAGES = ["/trainer", "/trainer/clients", "/trainer/schedule", "/trainer/money", "/trainer/analytics", "/trainer/nutrition"];

async function page(stage, user, path, label) {
  return timed(stage, "page", label, async () => {
    const response = await fetch(`${APP}${path}`, { headers: { cookie: user.cookies }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await response.arrayBuffer();
    // A redirect means the session or consent did not hold: the screen the user asked for never rendered.
    const where = response.headers.get("location");
    return [response.status === 200, where ? `HTTP ${response.status} → ${new URL(where, APP).pathname}` : `HTTP ${response.status}`];
  });
}

async function rpc(stage, kind, user, name, body, role = "") {
  return timed(stage, kind, `${role ? `${role} ` : ""}rpc ${name}`, async () => {
    const response = await fetch(`${API}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: supabase.PUBLISHABLE_KEY,
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    return [response.ok, `HTTP ${response.status} ${text.slice(0, 60)}`];
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function clientIteration(stage, user) {
  for (const path of CLIENT_PAGES) await page(stage, user, path, `client ${path}`);
  await rpc(stage, "write", user, "add_food_entry", { p_day: today(), p_meal: "snack", p_kcal: 120, p_title: "Нагрузка" });
  await rpc(stage, "write", user, "add_water", { p_day: today(), p_ml: 250 });
  await rpc(stage, "rpc", user, "search_foods", { p_query: pick(["греч", "кур", "яблок", "овся"]), p_limit: 20 });
}

async function trainerIteration(stage, user, role) {
  for (const path of TRAINER_PAGES) await page(stage, user, path, `${role} ${path}`);
  await rpc(stage, "rpc", user, "trainer_nutrition_adherence", { p_days: 7 }, role);
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  console.log(`Signing in ${users.length} load users at ${APP} …`);
  const signedIn = (await pool(users, SIGN_IN_CONCURRENCY, signIn)).filter(Boolean);
  const clients = signedIn.filter((u) => u.handle.startsWith("load_c"));
  const trainers = signedIn.filter((u) => /^load_t\d/.test(u.handle));
  const big = signedIn.find((u) => u.handle === "load_big");
  if (!clients.length || !trainers.length || !big) throw new Error("Sign-in failed for whole roles; see the sign-in row of the report.");

  // Warm-up: the first request of each route compiles nothing in `next start`, but fills Postgres and Node caches.
  for (const path of CLIENT_PAGES) await page("warm-up", clients[0], path, `client ${path}`);
  for (const path of TRAINER_PAGES) await page("warm-up", trainers[0], path, `trainer ${path}`);

  for (const { users: vus, seconds } of STAGES) {
    const stage = `${vus} VU`;
    console.log(`Stage ${stage}, ${seconds} s …`);
    const until = Date.now() + seconds * 1000;
    await Promise.all(
      Array.from({ length: vus }, async () => {
        while (Date.now() < until) {
          // 80 % clients, 15 % ordinary trainers, 5 % the trainer with the big roster: closer to a real day than an even split.
          const roll = Math.random() * 100;
          if (roll < 80) await clientIteration(stage, pick(clients));
          else if (roll < 95) await trainerIteration(stage, pick(trainers), "trainer");
          else await trainerIteration(stage, big, "big roster");
        }
      }),
    );
  }

  const rows = [...samples.values()].filter((s) => s.stage !== "warm-up");
  const failures = [];
  const lines = [];
  const header = "| Stage | Request | n | Errors | p50 ms | p95 ms | p99 ms | max ms | Target p95 |";
  lines.push(header, "|---|---|---:|---:|---:|---:|---:|---:|---|");
  const stageOrder = ["sign-in", ...STAGES.map((s) => `${s.users} VU`)];
  rows.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || a.label.localeCompare(b.label));
  for (const s of rows) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    const target = TARGETS.p95[s.kind];
    const errorRate = s.errors / sorted.length;
    const counts = s.kind !== "page" || s.stage === `${STAGES[0].users} VU`;
    const slow = counts && p95 > target;
    const failing = errorRate > TARGETS.errorRate;
    if (slow) failures.push(`${s.stage} ${s.label}: p95 ${Math.round(p95)} ms > ${target} ms`);
    if (failing) failures.push(`${s.stage} ${s.label}: ${(errorRate * 100).toFixed(1)} % errors (${[...s.details].map(([d, n]) => `${n}× ${d}`).join(", ")})`);
    lines.push(
      `| ${s.stage} | ${s.label} | ${sorted.length} | ${s.errors ? `**${s.errors}**` : 0} | ${Math.round(percentile(sorted, 50))} | ${slow ? `**${Math.round(p95)}**` : Math.round(p95)} | ${Math.round(percentile(sorted, 99))} | ${Math.round(sorted.at(-1))} | ${counts ? target : `(${target})`} |`,
    );
  }
  const throughput = STAGES.map(({ users: vus, seconds }) => {
    const n = rows.filter((s) => s.stage === `${vus} VU`).reduce((sum, s) => sum + s.ms.length, 0);
    return `${vus} VU: ${(n / seconds).toFixed(1)} req/s`;
  });

  const report = [
    `Load run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC against ${APP} and ${API}.`,
    `Users signed in: ${signedIn.length} of ${users.length} (${clients.length} clients, ${trainers.length} trainers, 1 big roster).`,
    `Throughput: ${throughput.join("; ")}.`,
    "Page targets in brackets are not checked: one `next start` process is past its capacity there (see run.mjs).",
    "",
    ...lines,
    "",
    failures.length ? `Missed targets:\n${failures.map((f) => `- ${f}`).join("\n")}` : "Every target met.",
  ].join("\n");
  console.log(`\n${report}`);
  if (REPORT) writeFileSync(REPORT, `${report}\n`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
