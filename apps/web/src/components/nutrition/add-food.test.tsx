// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findBarcode, findFoods } from "@/lib/nutrition/diary-actions";
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
