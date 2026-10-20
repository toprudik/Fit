import type { Database } from "@/lib/supabase/database.types";

/** "Тренер-основатель" and "Амбассадор" (ambassador programme §1), in the order the showcase prints them. */
export type TrainerHonor = Database["public"]["Enums"]["trainer_honor"];
export const TRAINER_HONORS = ["founder", "ambassador"] as const satisfies readonly TrainerHonor[];

export function isTrainerHonor(value: unknown): value is TrainerHonor {
  return typeof value === "string" && (TRAINER_HONORS as readonly string[]).includes(value);
}

/** The honors get_trainer_honors answered, known ones only, in showcase order. */
export function honorsFrom(rows: unknown): TrainerHonor[] {
  const held = new Set(Array.isArray(rows) ? rows.filter(isTrainerHonor) : []);
  return TRAINER_HONORS.filter((honor) => held.has(honor));
}
