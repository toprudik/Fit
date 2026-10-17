"use client";

import type { DiaryEntry } from "@/lib/nutrition/diary";
import { MealGroups } from "./meal-list";

/** The meals of the client's day as the trainer reads them: no editing (§3.8). */
export function ReadOnlyMeals({ entries }: { entries: DiaryEntry[] }) {
  return (
    <div className="flex flex-col gap-4">
      <MealGroups entries={entries} />
    </div>
  );
}
