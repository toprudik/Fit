import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryInput, FoodInput } from "./diary-actions";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const foods = vi.hoisted(() => ({
  searchFoods: vi.fn(async () => ({ foods: [], catalogDown: false, drafts: [] })),
  foodByBarcode: vi.fn(async () => ({ food: null, catalogDown: true, draft: null })),
}));
vi.mock("./foods", () => foods);

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const query = (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = { then: (resolve: (value: Answer) => unknown) => resolve(db.answer) } as Record<string, unknown>;
      for (const step of ["delete", "eq"]) {
        chain[step] = (...args: unknown[]) => {
          steps.push(step, ...args);
          return chain;
        };
      }
      return chain;
    };
    return {
      from: query,
      rpc: (fn: string, args: unknown) => {
        db.calls.push(["rpc", fn, args]);
        return Promise.resolve(db.answer);
      },
    };
  },
}));

const {
  addComment,
  addEntry,
  archiveFood,
  copyPreviousMeal,
  deleteComment,
  deleteEntry,
  editComment,
  findBarcode,
  findFoods,
  hideComment,
  saveDish,
  saveFood,
  setFavorite,
  updateEntry,
} = await import("./diary-actions");

const FOOD = "00000000-0000-4000-8000-000000000001";
const ENTRY = "00000000-0000-4000-8000-000000000002";
const PAIR = "00000000-0000-4000-8000-000000000003";
const COMMENT = "00000000-0000-4000-8000-000000000004";
const FOOD_2 = "00000000-0000-4000-8000-000000000005";

const error = (code: string) => ({ data: null, error: { code, message: "internal detail" } });

/** The shared error mapping: a bad value or a missing row is "invalid", a duplicate is "taken", anything else "failed". */
const MAPPED = [
  ["22023", "invalid"],
  ["P0002", "invalid"],
  ["23505", "taken"],
  ["XX000", "failed"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("findFoods", () => {
  it("searches in the user's language", async () => {
    await findFoods("гречка");
    expect(foods.searchFoods).toHaveBeenCalledWith("гречка", "en");
  });

  it("answers nothing for a query that is not text", async () => {
    expect(await findFoods(5 as unknown as string)).toEqual({ foods: [], catalogDown: false, drafts: [] });
    expect(foods.searchFoods).not.toHaveBeenCalled();
  });
});

describe("findBarcode", () => {
  it("looks up the normalized digits and returns them", async () => {
    expect(await findBarcode(" 4600-1234 5678 9 ")).toEqual({ food: null, catalogDown: true, draft: null, barcode: "4600123456789" });
    expect(foods.foodByBarcode).toHaveBeenCalledWith("4600123456789", "en");
  });

  it.each([
    ["seven digits", "1234567"],
    ["fifteen digits", "123456789012345"],
    ["letters", "46001234abc"],
    ["not text", 4600123456789 as unknown as string],
  ])("gives no food for %s without a lookup", async (_label, value) => {
    expect(await findBarcode(value)).toEqual({ food: null, catalogDown: false, draft: null, barcode: null });
    expect(foods.foodByBarcode).not.toHaveBeenCalled();
  });
});

describe("addEntry", () => {
  it("adds a food by grams", async () => {
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 150 })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "add_food_entry", { p_day: "2026-10-18", p_meal: "lunch", p_food_id: FOOD, p_grams: 150 }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("adds a food by servings", async () => {
    await addEntry({ day: "2026-10-18", meal: "snack", foodId: FOOD, servings: 1.5 });
    expect(db.calls).toEqual([["rpc", "add_food_entry", { p_day: "2026-10-18", p_meal: "snack", p_food_id: FOOD, p_servings: 1.5 }]]);
  });

  it("adds quick kcal with a trimmed title and leaves empty macros out", async () => {
    await addEntry({ day: "2026-10-18", meal: "dinner", kcal: 450, proteinG: 20, fatG: null, carbsG: 0, title: "  Пицца  " });
    expect(db.calls).toEqual([
      ["rpc", "add_food_entry", { p_day: "2026-10-18", p_meal: "dinner", p_kcal: 450, p_protein: 20, p_carbs: 0, p_title: "Пицца" }],
    ]);
  });

  it("sends no title for a blank one", async () => {
    await addEntry({ day: "2026-10-18", meal: "dinner", kcal: 1, proteinG: null, fatG: null, carbsG: null, title: "  " });
    expect(db.calls[0][2]).toEqual({ p_day: "2026-10-18", p_meal: "dinner", p_kcal: 1 });
  });

  it("takes the edges of grams, servings and kcal", async () => {
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 0.1 })).toEqual({ ok: true });
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 5000 })).toEqual({ ok: true });
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, servings: 0.01 })).toEqual({ ok: true });
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, servings: 100 })).toEqual({ ok: true });
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", kcal: 5000, proteinG: 1000, fatG: 1000, carbsG: 1000, title: "a".repeat(200) })).toEqual({
      ok: true,
    });
  });

  it.each<[string, EntryInput]>([
    ["a malformed day", { day: "18.10.2026", meal: "lunch", foodId: FOOD, grams: 100 }],
    ["an impossible day", { day: "2026-02-30", meal: "lunch", foodId: FOOD, grams: 100 }],
    ["an unknown meal", { day: "2026-10-18", meal: "brunch" as "lunch", foodId: FOOD, grams: 100 }],
    ["a malformed food", { day: "2026-10-18", meal: "lunch", foodId: "food-1", grams: 100 }],
    ["grams under 0.1", { day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 0.09 }],
    ["grams over 5000", { day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 5000.1 }],
    ["servings under 0.01", { day: "2026-10-18", meal: "lunch", foodId: FOOD, servings: 0 }],
    ["servings over 100", { day: "2026-10-18", meal: "lunch", foodId: FOOD, servings: 101 }],
    ["neither grams nor servings", { day: "2026-10-18", meal: "lunch", foodId: FOOD } as EntryInput],
    ["zero kcal", { day: "2026-10-18", meal: "lunch", kcal: 0, proteinG: null, fatG: null, carbsG: null, title: "" }],
    ["kcal over 5000", { day: "2026-10-18", meal: "lunch", kcal: 5001, proteinG: null, fatG: null, carbsG: null, title: "" }],
    ["negative protein", { day: "2026-10-18", meal: "lunch", kcal: 100, proteinG: -1, fatG: null, carbsG: null, title: "" }],
    ["carbs over 1000", { day: "2026-10-18", meal: "lunch", kcal: 100, proteinG: null, fatG: null, carbsG: 1001, title: "" }],
    ["a title over 200 characters", { day: "2026-10-18", meal: "lunch", kcal: 100, proteinG: null, fatG: null, carbsG: null, title: "a".repeat(201) }],
    ["a title that is not text", { day: "2026-10-18", meal: "lunch", kcal: 100, proteinG: null, fatG: null, carbsG: null, title: null as unknown as string }],
  ])("refuses %s without a call", async (_label, input) => {
    expect(await addEntry(input)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", foodId: FOOD, grams: 100 })).toEqual({ ok: false, reason });
    expect(await addEntry({ day: "2026-10-18", meal: "lunch", kcal: 100, proteinG: null, fatG: null, carbsG: null, title: "" })).toEqual({ ok: false, reason });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("updateEntry", () => {
  it("changes the meal and the amount through update_food_entry", async () => {
    expect(await updateEntry({ id: ENTRY, meal: "breakfast", grams: 200 })).toEqual({ ok: true });
    expect(await updateEntry({ id: ENTRY, meal: "breakfast", servings: 2 })).toEqual({ ok: true });
    expect(await updateEntry({ id: ENTRY, meal: "snack", kcal: 300 })).toEqual({ ok: true });
    expect(await updateEntry({ id: ENTRY, meal: "snack" })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["rpc", "update_food_entry", { p_id: ENTRY, p_meal: "breakfast", p_grams: 200 }],
      ["rpc", "update_food_entry", { p_id: ENTRY, p_meal: "breakfast", p_servings: 2 }],
      ["rpc", "update_food_entry", { p_id: ENTRY, p_meal: "snack", p_kcal: 300 }],
      ["rpc", "update_food_entry", { p_id: ENTRY, p_meal: "snack" }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["a malformed id", { id: "e", meal: "lunch" }],
    ["an unknown meal", { id: ENTRY, meal: "brunch" }],
    ["grams over 5000", { id: ENTRY, meal: "lunch", grams: 5001 }],
    ["zero servings", { id: ENTRY, meal: "lunch", servings: 0 }],
    ["zero kcal", { id: ENTRY, meal: "lunch", kcal: 0 }],
    ["kcal over 5000", { id: ENTRY, meal: "lunch", kcal: 5001 }],
  ])("refuses %s without a call", async (_label, change) => {
    expect(await updateEntry(change as Parameters<typeof updateEntry>[0])).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await updateEntry({ id: ENTRY, meal: "lunch" })).toEqual({ ok: false, reason });
  });
});

describe("deleteEntry", () => {
  it("deletes the own entry by id", async () => {
    expect(await deleteEntry(ENTRY)).toEqual({ ok: true });
    expect(db.calls).toEqual([["food_diary_entries", "delete", "eq", "id", ENTRY]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id", async () => {
    expect(await deleteEntry("1")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await deleteEntry(ENTRY)).toEqual({ ok: false, reason });
  });
});

describe("copyPreviousMeal", () => {
  it("copies the same meal from the day before", async () => {
    expect(await copyPreviousMeal("2026-10-18", "breakfast")).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "copy_food_meal", { p_from: "2026-10-17", p_meal: "breakfast", p_to: "2026-10-18" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("crosses month and year boundaries and leap days", async () => {
    await copyPreviousMeal("2026-01-01", "lunch");
    await copyPreviousMeal("2028-03-01", "lunch");
    expect(db.calls.map((call) => (call[2] as { p_from: string }).p_from)).toEqual(["2025-12-31", "2028-02-29"]);
  });

  it("refuses a malformed day or meal", async () => {
    expect(await copyPreviousMeal("2026-13-01", "lunch")).toEqual({ ok: false, reason: "invalid" });
    expect(await copyPreviousMeal("2026-10-18", "supper" as "lunch")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await copyPreviousMeal("2026-10-18", "lunch")).toEqual({ ok: false, reason });
  });
});

describe("saveFood", () => {
  const food: FoodInput = {
    id: null,
    name: "  Творог 5%  ",
    brand: "  Ферма  ",
    barcode: " 4600 1234 5678 9 ",
    kcal100: 121,
    protein100: 17,
    fat100: 5,
    carbs100: 1.8,
    servingG: 180,
    servingLabel: " пачка ",
  };

  it("creates a product with trimmed texts and the normalized barcode", async () => {
    db.answer = { data: FOOD, error: null };
    expect(await saveFood(food)).toEqual({ ok: true, id: FOOD });
    expect(db.calls).toEqual([
      [
        "rpc",
        "save_food",
        {
          p_id: null,
          p_name: "Творог 5%",
          p_kcal: 121,
          p_protein: 17,
          p_fat: 5,
          p_carbs: 1.8,
          p_serving_g: 180,
          p_serving_label: "пачка",
          p_barcode: "4600123456789",
          p_brand: "Ферма",
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("edits a product by id and leaves empty values out", async () => {
    db.answer = { data: FOOD, error: null };
    await saveFood({ ...food, id: FOOD, brand: " ", barcode: "  ", protein100: null, fat100: null, carbs100: null, servingG: null, servingLabel: "" });
    expect(db.calls[0][2]).toEqual({ p_id: FOOD, p_name: "Творог 5%", p_kcal: 121 });
  });

  it("takes the edges of kcal and macros", async () => {
    db.answer = { data: FOOD, error: null };
    expect(await saveFood({ ...food, kcal100: 0, protein100: 100, fat100: 0, carbs100: 0 })).toMatchObject({ ok: true });
    expect(await saveFood({ ...food, kcal100: 900, protein100: 50, fat100: 30, carbs100: 20 })).toMatchObject({ ok: true });
  });

  it.each<[string, Partial<FoodInput>]>([
    ["a malformed id", { id: "food-1" }],
    ["a blank name", { name: "   " }],
    ["a name over 200 characters", { name: "a".repeat(201) }],
    ["a brand over 200 characters", { brand: "a".repeat(201) }],
    ["a serving label over 80 characters", { servingLabel: "a".repeat(81) }],
    ["a malformed barcode", { barcode: "12345" }],
    ["negative kcal", { kcal100: -1 }],
    ["kcal over 900", { kcal100: 901 }],
    ["protein over 100 g", { protein100: 101 }],
    ["negative fat", { fat100: -0.1 }],
    ["macros over 100 g together", { protein100: 40, fat100: 40, carbs100: 21 }],
    ["a serving under 0.1 g", { servingG: 0.05 }],
    ["a serving over 5000 g", { servingG: 5001 }],
  ])("refuses %s without a call", async (_label, over) => {
    expect(await saveFood({ ...food, ...over })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await saveFood(food)).toEqual({ ok: false, reason });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails when the database returns no id", async () => {
    db.answer = { data: null, error: null };
    expect(await saveFood(food)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("saveDish", () => {
  const dish = { name: "  Салат  ", items: [{ foodId: FOOD, grams: 100 }, { foodId: FOOD_2, grams: 50.5 }], totalG: 140 };

  it("creates a dish from products with grams and the cooked weight", async () => {
    db.answer = { data: FOOD, error: null };
    expect(await saveDish(dish)).toEqual({ ok: true, id: FOOD });
    expect(db.calls).toEqual([
      [
        "rpc",
        "save_dish",
        {
          p_id: null,
          p_name: "Салат",
          p_items: [
            { food_id: FOOD, grams: 100 },
            { food_id: FOOD_2, grams: 50.5 },
          ],
          p_total_g: 140,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("leaves the cooked weight out when it is not given", async () => {
    db.answer = { data: FOOD, error: null };
    await saveDish({ ...dish, totalG: null });
    expect(db.calls[0][2]).not.toHaveProperty("p_total_g");
  });

  it("takes 1 and 50 items and a cooked weight of 1 to 50000 g", async () => {
    db.answer = { data: FOOD, error: null };
    expect(await saveDish({ ...dish, items: [dish.items[0]], totalG: 1 })).toMatchObject({ ok: true });
    expect(await saveDish({ ...dish, items: Array.from({ length: 50 }, () => dish.items[0]), totalG: 50000 })).toMatchObject({ ok: true });
  });

  it.each([
    ["a blank name", { name: " " }],
    ["a name over 200 characters", { name: "a".repeat(201) }],
    ["no items", { items: [] }],
    ["51 items", { items: Array.from({ length: 51 }, () => ({ foodId: FOOD, grams: 10 })) }],
    ["a malformed food", { items: [{ foodId: "f", grams: 10 }] }],
    ["zero grams", { items: [{ foodId: FOOD, grams: 0 }] }],
    ["items that are not a list", { items: "x" }],
    ["a cooked weight under 1 g", { totalG: 0.5 }],
    ["a cooked weight over 50000 g", { totalG: 50001 }],
  ])("refuses %s without a call", async (_label, over) => {
    expect(await saveDish({ ...dish, ...over } as typeof dish)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await saveDish(dish)).toEqual({ ok: false, reason });
  });

  it("fails when the database returns no id", async () => {
    expect(await saveDish(dish)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("archiveFood", () => {
  it("archives through archive_food", async () => {
    expect(await archiveFood(FOOD)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "archive_food", { p_id: FOOD }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id", async () => {
    expect(await archiveFood("x")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await archiveFood(FOOD)).toEqual({ ok: false, reason });
  });
});

describe("setFavorite", () => {
  it.each([true, false])("sets favorite to %s through set_food_favorite", async (favorite) => {
    expect(await setFavorite(FOOD, favorite)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_food_favorite", { p_food_id: FOOD, p_favorite: favorite }]]);
  });

  it("refuses a malformed id or a flag that is not a boolean", async () => {
    expect(await setFavorite("x", true)).toEqual({ ok: false, reason: "invalid" });
    expect(await setFavorite(FOOD, "true" as unknown as boolean)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await setFavorite(FOOD, true)).toEqual({ ok: false, reason });
  });
});

describe("addComment", () => {
  it("adds the trainer's trimmed comment on a day", async () => {
    expect(await addComment(PAIR, "2026-10-18", "  Больше белка  ")).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "add_food_comment", { p_coaching_id: PAIR, p_day: "2026-10-18", p_body: "Больше белка" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes a comment of exactly 1000 characters", async () => {
    expect(await addComment(PAIR, "2026-10-18", "a".repeat(1000))).toEqual({ ok: true });
  });

  it.each([
    ["a malformed pair", ["p", "2026-10-18", "Ок"]],
    ["a malformed day", [PAIR, "2026-10-32", "Ок"]],
    ["a blank comment", [PAIR, "2026-10-18", "  "]],
    ["a comment over 1000 characters", [PAIR, "2026-10-18", "a".repeat(1001)]],
    ["a comment that is not text", [PAIR, "2026-10-18", 7]],
  ])("refuses %s without a call", async (_label, args) => {
    expect(await addComment(...(args as [string, string, string]))).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reads a closed diary (42501) as invalid, then the shared mapping", async () => {
    db.answer = error("42501");
    expect(await addComment(PAIR, "2026-10-18", "Ок")).toEqual({ ok: false, reason: "invalid" });
    for (const [code, reason] of MAPPED) {
      db.answer = error(code);
      expect(await addComment(PAIR, "2026-10-18", "Ок")).toEqual({ ok: false, reason });
    }
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("editComment", () => {
  it("edits the trimmed comment through edit_food_comment", async () => {
    db.answer = { data: true, error: null };
    expect(await editComment(COMMENT, " Новый текст ")).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "edit_food_comment", { p_id: COMMENT, p_body: "Новый текст" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id or body", async () => {
    expect(await editComment("c", "Ок")).toEqual({ ok: false, reason: "invalid" });
    expect(await editComment(COMMENT, "a".repeat(1001))).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reads a comment that could no longer be edited as invalid", async () => {
    db.answer = { data: false, error: null };
    expect(await editComment(COMMENT, "Ок")).toEqual({ ok: false, reason: "invalid" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await editComment(COMMENT, "Ок")).toEqual({ ok: false, reason });
  });
});

describe("deleteComment", () => {
  it("deletes through delete_food_comment", async () => {
    expect(await deleteComment(COMMENT)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "delete_food_comment", { p_id: COMMENT }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id", async () => {
    expect(await deleteComment("c")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await deleteComment(COMMENT)).toEqual({ ok: false, reason });
  });
});

describe("hideComment", () => {
  it.each([true, false])("sets hidden to %s through hide_food_comment", async (hidden) => {
    expect(await hideComment(COMMENT, hidden)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "hide_food_comment", { p_id: COMMENT, p_hidden: hidden }]]);
  });

  it("refuses a malformed id or a flag that is not a boolean", async () => {
    expect(await hideComment("c", true)).toEqual({ ok: false, reason: "invalid" });
    expect(await hideComment(COMMENT, null as unknown as boolean)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each(MAPPED)("maps %s to %s", async (code, reason) => {
    db.answer = error(code);
    expect(await hideComment(COMMENT, true)).toEqual({ ok: false, reason });
  });
});
