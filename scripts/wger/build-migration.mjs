#!/usr/bin/env node
// Builds a migration with the wger exercise catalog (PRD 2.10-1..3, ADR 0012): every wger exercise with its
// English and Russian name and description, category, muscles, equipment, license and authors. Russian names
// missing in wger come from ru-names.json next to this script. The migration upserts by wger_id, so a later
// run refreshes the catalog without touching custom exercises or logs.
//
// Usage (repo root): node scripts/wger/build-migration.mjs supabase/migrations/<timestamp>_wger_catalog.sql
// It reads https://wger.de/api/v2/exerciseinfo/ (public, no key). Set WGER_CACHE_DIR to reuse saved pages.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/wger/build-migration.mjs <output.sql>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const ruNames = JSON.parse(readFileSync(join(here, "ru-names.json"), "utf8"));
const cacheDir = process.env.WGER_CACHE_DIR;

const LANG_EN = 2;
const LANG_RU = 5;

const LICENSES = { "CC-BY-SA 4": "CC-BY-SA-4.0", "CC-BY-SA 3": "CC-BY-SA-3.0", CC0: "CC0-1.0" };

// wger English names → the keys the app translates (src/lib/workouts/catalog.ts).
const MUSCLES = {
  Shoulders: "shoulders",
  Glutes: "glutes",
  Abs: "abs",
  Lats: "lats",
  Quads: "quads",
  Triceps: "triceps",
  Biceps: "biceps",
  Chest: "chest",
  Trapezius: "traps",
  Hamstrings: "hamstrings",
  "Obliquus externus abdominis": "obliques",
  Calves: "calves",
  Brachialis: "brachialis",
  "Serratus anterior": "serratus",
  Soleus: "soleus",
};
const EQUIPMENT = {
  "none (bodyweight exercise)": "bodyweight",
  Dumbbell: "dumbbell",
  "Cable machine": "cable",
  Barbell: "barbell",
  Bench: "bench",
  "Pull-up bar": "pull_up_bar",
  "Resistance band": "band",
  "Incline bench": "incline_bench",
  "SZ-Bar": "ez_bar",
  Kettlebell: "kettlebell",
  "Gym mat": "mat",
  "Swiss Ball": "swiss_ball",
};

async function fetchPage(offset) {
  const file = cacheDir && join(cacheDir, `p${offset}.json`);
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(`https://wger.de/api/v2/exerciseinfo/?limit=200&offset=${offset}`);
  if (!res.ok) throw new Error(`wger answered ${res.status} at offset ${offset}`);
  const body = await res.json();
  if (file) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  }
  return body;
}

function plainText(html) {
  if (!html) return null;
  const text = html
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|li|ol|ul|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n\s*/g, "\n")
    .trim();
  return text ? text.slice(0, 5000) : null;
}

function clean(name) {
  return name.replace(/\s+/g, " ").trim().slice(0, 200);
}

const sql = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (xs) => (xs.length ? `array[${xs.map(sql).join(", ")}]` : "'{}'::text[]");
const keys = (xs, map) => [...new Set(xs.map((x) => map[x] ?? null).filter(Boolean))];

const all = [];
for (let offset = 0; ; offset += 200) {
  const page = await fetchPage(offset);
  all.push(...page.results);
  if (!page.next) break;
}
all.sort((a, b) => a.id - b.id);

const exercises = [];
const translations = [];
for (const e of all) {
  const en = e.translations.find((t) => t.language === LANG_EN);
  if (!en || !clean(en.name)) continue;
  const ru = e.translations.find((t) => t.language === LANG_RU);
  const license = LICENSES[e.license?.short_name];
  if (!license) throw new Error(`Unknown license ${e.license?.short_name} on wger exercise ${e.id}`);
  const authors = [...new Set([e.license_author, ...(en.author_history ?? []), ...(ru?.author_history ?? [])])]
    .map((a) => (a ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
  exercises.push(
    `(${e.id}, ${sql(e.uuid)}, ${sql(clean(en.name))}, ${sql(e.category?.name?.toLowerCase() ?? null)}, ` +
      `${arr(keys(e.muscles.map((m) => m.name_en || m.name), MUSCLES))}, ` +
      `${arr(keys(e.muscles_secondary.map((m) => m.name_en || m.name), MUSCLES))}, ` +
      `${arr(keys(e.equipment.map((q) => q.name), EQUIPMENT))}, ${sql(license)}, ${sql(authors || null)}, ` +
      `${sql(`https://wger.de/exercise/${e.id}/view/`)})`,
  );
  translations.push(`(${e.id}, 'en', ${sql(clean(en.name))}, ${sql(plainText(en.description))})`);
  const ruName = ruNames[String(e.id)] ?? (ru && clean(ru.name));
  if (ruName) translations.push(`(${e.id}, 'ru', ${sql(ruName)}, ${sql(ru ? plainText(ru.description) : null)})`);
}

const header = `-- wger exercise catalog (PRD 2.10-1..3, ADR 0012), generated by scripts/wger/build-migration.mjs from
-- https://wger.de/api/v2/exerciseinfo/ on ${new Date().toISOString().slice(0, 10)}: ${exercises.length} exercises. Do not edit by hand; run the
-- script again into a new migration to refresh. Data by the wger project and its authors (license and authors
-- per exercise, mostly CC-BY-SA 4.0); Russian names wger lacks are DaFit's, shared under the same license.
-- Upserts by wger_id: custom exercises, logs and templates are untouched.
`;

const body = `${header}
insert into public.exercises (
  source, wger_id, wger_uuid, name, category, muscles_primary, muscles_secondary, equipment, license, license_author,
  source_url
)
select 'wger', v.wger_id, v.wger_uuid::uuid, v.name, v.category, v.muscles_primary, v.muscles_secondary, v.equipment,
       v.license, v.license_author, v.source_url
from (values
  ${exercises.join(",\n  ")}
) as v (wger_id, wger_uuid, name, category, muscles_primary, muscles_secondary, equipment, license, license_author,
        source_url)
on conflict (wger_id) do update set
  wger_uuid = excluded.wger_uuid, name = excluded.name, category = excluded.category,
  muscles_primary = excluded.muscles_primary, muscles_secondary = excluded.muscles_secondary,
  equipment = excluded.equipment, license = excluded.license, license_author = excluded.license_author,
  source_url = excluded.source_url, archived_at = null;

insert into public.exercise_translations (exercise_id, locale, name, description)
select e.id, v.locale::public.app_locale, v.name, v.description
from (values
  ${translations.join(",\n  ")}
) as v (wger_id, locale, name, description)
join public.exercises e on e.wger_id = v.wger_id
on conflict (exercise_id, locale) do update set name = excluded.name, description = excluded.description;
`;

writeFileSync(out, body);
console.log(`${out}: ${exercises.length} exercises, ${translations.length} translations`);
