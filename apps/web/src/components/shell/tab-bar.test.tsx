// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";
import { ZONES } from "@/lib/navigation/zones";
import { renderWithProviders } from "@/test/render";
import { TabBar, type TabSelectHandler } from "./tab-bar";
import { EXPECTED_TABS, SECTIONS_LABEL } from "./tabs.fixture";

vi.mock("next/link", async () => ({ default: (await import("./tabs.fixture")).MockLink }));

const LOCALES: readonly Locale[] = ["ru", "en"];

function tabBar(locale: Locale) {
  return screen.getByRole("navigation", { name: SECTIONS_LABEL[locale] });
}

describe("TabBar", () => {
  for (const locale of LOCALES) {
    for (const zone of ZONES) {
      const expected = EXPECTED_TABS[locale][zone];

      it(`shows the ${zone} zone's five tabs in ${locale}, linking to the tab roots`, () => {
        renderWithProviders(<TabBar zone={zone} activeId={null} />, { locale });

        const links = within(tabBar(locale)).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(expected.map(([label]) => label));
        expect(links.map((link) => link.getAttribute("href"))).toEqual(expected.map(([, href]) => href));
      });
    }
  }

  it("marks only the active tab as the current page", () => {
    renderWithProviders(<TabBar zone="trainer" activeId="clients" />);

    const current = within(tabBar("ru"))
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Клиенты"]);
  });

  it("marks no tab when the screen belongs to none", () => {
    const { container } = renderWithProviders(<TabBar zone="client" activeId={null} />);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it("hands a tab press to onSelect, which may take over the navigation", () => {
    const onSelect = vi.fn<TabSelectHandler>((_tab, event) => event.preventDefault());
    renderWithProviders(<TabBar zone="client" activeId="home" onSelect={onSelect} />);

    const progress = screen.getByRole("link", { name: "Прогресс" });
    const notPrevented = fireEvent.click(progress);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: "progress", href: "/client/progress" });
    expect(notPrevented).toBe(false);
  });
});
