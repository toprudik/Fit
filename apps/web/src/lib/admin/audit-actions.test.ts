import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

const MIGRATIONS = join(process.cwd(), "../../supabase/migrations");

/** Every action code the database writes to admin_audit_log, read from the inserts in the migrations. */
function auditActions(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(MIGRATIONS)) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const insert of sql.matchAll(/insert into public\.admin_audit_log\b[^;]*?values\s*\(([^;]*?)\);/g)) {
      for (const code of insert[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)) found.add(code[1]);
    }
  }
  return [...found].sort();
}

describe("admin audit log", () => {
  const actions = auditActions();

  it("finds the actions in the migrations", () => {
    expect(actions).toContain("break_glass.open");
    expect(actions).toContain("trainer_honor.revoke");
  });

  it.each(LOCALES)("names every action in %s, so the log never shows a code", (locale) => {
    const named = Object.keys(dictionaries[locale].adminShell.audit.actions);
    expect(actions.filter((action) => !named.includes(action))).toEqual([]);
  });
});
