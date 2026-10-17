// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addEntry, findBarcode, findFoods } from "@/lib/nutrition/diary-actions";
import type { FoodShelf } from "@/lib/nutrition/diary-load";
import { renderWithProviders } from "@/test/render";
import { AddFood } from "./add-food";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/nutrition/diary-actions", () => ({ addEntry: vi.fn(), findBarcode: vi.fn(), findFoods: vi.fn(), setFavorite: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./barcode-scanner", () => ({ BarcodeScanner: () => null }));

const shelf: FoodShelf = { today: "2026-10-17", meal: "lunch", favorites: [], recent: [], own: [], favoriteIds: [] };
const draft = { code: "4600000000017", name: "Хлебцы ржаные", brand: "Пекарня" };

describe("AddFood: a catalog product without kcal", () => {
  beforeEach(() => vi.useRealTimers());

  it("shows it in the search with a note, leading to an own product with its name, brand and barcode", async () => {
    vi.mocked(findFoods).mockResolvedValue({ foods: [], catalogDown: false, drafts: [draft] });
    renderWithProviders(<AddFood day="2026-10-17" initialMeal="lunch" shelf={shelf} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "хлебцы" } });
    const row = await screen.findByRole("link", { name: /Хлебцы ржаные/ }, { timeout: 2000 });
    expect(row.textContent).toContain("Пекарня, калорий нет");
    const href = new URL(row.getAttribute("href") ?? "", "https://example.test");
    expect(href.pathname).toBe("/client/diary/food/foods/new");
    expect(Object.fromEntries(href.searchParams)).toEqual({ barcode: draft.code, name: draft.name, brand: draft.brand, day: "2026-10-17", meal: "lunch" });
    expect(screen.queryByText(/Ничего не нашлось/)).toBeNull();
  });

  it("offers to type the kcal for a scanned barcode", async () => {
    vi.mocked(findBarcode).mockResolvedValue({ food: null, catalogDown: false, draft, barcode: draft.code });
    renderWithProviders(<AddFood day="2026-10-17" initialMeal="lunch" shelf={shelf} />);
    fireEvent.click(screen.getByRole("radio", { name: "Штрихкод" }));
    fireEvent.change(screen.getByLabelText("Цифры штрихкода"), { target: { value: draft.code } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    expect((await screen.findByText(/есть в каталоге, но без калорий/)).textContent).toContain("«Хлебцы ржаные»");
    expect(screen.getByRole("link", { name: "Вписать калории" }).getAttribute("href")).toContain("name=");
  });
});

describe("AddFood: weight in ounces in English", () => {
  it("asks for ounces and saves grams", async () => {
    const food = {
      id: "00000000-0000-4000-8000-000000000020",
      source: "custom" as const,
      kind: "product" as const,
      name: "Oats",
      brand: null,
      barcode: null,
      kcal100: 370,
      protein100: 13,
      fat100: 7,
      carbs100: 60,
      servingG: null,
      servingLabel: null,
    };
    vi.mocked(addEntry).mockResolvedValue({ ok: true });
    renderWithProviders(<AddFood day="2026-10-17" initialMeal="lunch" shelf={{ ...shelf, own: [food] }} />, { locale: "en" });
    fireEvent.click(screen.getByRole("radio", { name: "Mine" }));
    fireEvent.click(screen.getByRole("button", { name: /Oats/ }));
    const amount = (await screen.findByLabelText("How many ounces")) as HTMLInputElement;
    expect(amount.value).toBe("3.5");
    fireEvent.change(amount, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(addEntry).toHaveBeenCalledWith({ day: "2026-10-17", meal: "lunch", foodId: food.id, grams: 56.7 }));
  });
});
