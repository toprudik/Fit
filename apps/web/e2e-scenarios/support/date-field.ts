import { expect, type Locator, type Page } from "@playwright/test";
import { expectAccessible } from "../../e2e/support";

/** "14 мая 1992 г.", as DateField shows a "YYYY-MM-DD" day. */
export function ruDate(iso: string): string {
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** The DateField labelled `label`: its button reads "Дата 22 октября 2026" or "Дата Выбрать дату". */
export function dateField(scope: Page | Locator, label: string): Locator {
  return scope.getByRole("button", { name: new RegExp(`^${label} (\\d{1,2} |Выбрать дату)`) });
}

/** Opens the field's calendar, goes to the month by the month and year lists, and taps the day. */
export async function pickDate(page: Page, scope: Page | Locator, label: string, iso: string): Promise<void> {
  const calendar = page.getByRole("dialog", { name: label, exact: true });
  // Right after a load the button may not be hydrated yet, so a tap can go unnoticed: tap again.
  await expect(async () => {
    await dateField(scope, label).click();
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await expectAccessible(page);
  await calendar.getByRole("combobox", { name: "Год" }).selectOption(iso.slice(0, 4));
  await calendar.getByRole("combobox", { name: "Месяц" }).selectOption(iso.slice(5, 7));
  await calendar.getByRole("button", { name: ruDate(iso), exact: true }).click();
  await expect(calendar).toBeHidden();
  await expect(dateField(scope, label)).toContainText(ruDate(iso));
}

/** The TimeField labelled `label`: a group with the «Часы» and «Минуты» lists. */
export function timeField(scope: Page | Locator, label: string): Locator {
  return scope.getByRole("group", { name: label, exact: true });
}

/** Picks "HH:MM" in the TimeField labelled `label`, hours first, then minutes. */
export async function pickTime(scope: Page | Locator, label: string, time: string): Promise<void> {
  const field = timeField(scope, label);
  await field.getByRole("combobox", { name: "Часы" }).selectOption(time.slice(0, 2));
  await field.getByRole("combobox", { name: "Минуты" }).selectOption(time.slice(3, 5));
}
