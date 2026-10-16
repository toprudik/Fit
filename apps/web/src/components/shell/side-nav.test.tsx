// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount } from "@/components/account/account-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/config";
import { ZONES, type TabId, type Zone } from "@/lib/navigation/zones";
import { renderWithProviders } from "@/test/render";
import { SideNav } from "./side-nav";
import { EXPECTED_TABS, SECTIONS_LABEL } from "./tabs.fixture";

const push = vi.fn();

vi.mock("next/link", async () => ({ default: (await import("./tabs.fixture")).MockLink }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const LOCALES: readonly Locale[] = ["ru", "en"];

function renderSideNav({
  zone = "trainer",
  activeId = null,
  settingsActive = false,
  locale = "ru",
}: { zone?: Zone | null; activeId?: TabId | null; settingsActive?: boolean; locale?: Locale } = {}) {
  const onOpenProfile = vi.fn();
  // The narrow menu labels its icons with tooltips, which need the provider from the root layout.
  renderWithProviders(
    <TooltipProvider delayDuration={0}>
      <SideNav zone={zone} activeId={activeId} settingsActive={settingsActive} onOpenProfile={onOpenProfile} />
    </TooltipProvider>,
    { locale },
  );
  return { onOpenProfile };
}

const SETTINGS: Record<Locale, readonly [label: string, href: string]> = { ru: ["Настройки", "/settings"], en: ["Settings", "/settings"] };

function sections(locale: Locale) {
  return screen.getByRole("navigation", { name: SECTIONS_LABEL[locale] });
}

afterEach(() => {
  push.mockReset();
  resetAccountStoreForTests();
  vi.unstubAllGlobals();
});

describe("SideNav", () => {
  for (const locale of LOCALES) {
    for (const zone of ZONES) {
      const expected = EXPECTED_TABS[locale][zone];

      it(`lists the ${zone} zone's sections in ${locale}, linking to the tab roots, and settings last`, () => {
        renderSideNav({ zone, locale });

        const links = within(sections(locale)).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([...expected, SETTINGS[locale]].map(([label]) => label));
        expect(links.map((link) => link.getAttribute("href"))).toEqual([...expected, SETTINGS[locale]].map(([, href]) => href));
      });
    }
  }

  it("marks only the active section as the current page", () => {
    renderSideNav({ zone: "client", activeId: "diary" });

    const current = within(sections("ru"))
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Дневник"]);
  });

  it("marks settings as the current page on the settings screen, and no section", () => {
    renderSideNav({ zone: "trainer", settingsActive: true });

    const current = within(sections("ru"))
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Настройки"]);
  });

  it("shows no zone's sections or zone switch while the zone is unknown", () => {
    renderSideNav({ zone: null, settingsActive: true });

    expect(within(sections("ru")).getAllByRole("link").map((link) => link.textContent)).toEqual(["Настройки"]);
    expect(screen.queryByRole("radiogroup", { name: "Зона" })).toBeNull();
    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy();
  });

  it("shows a label's tooltip on keyboard focus, not on focus put back by a closing dialog", () => {
    // Radix measures the open tooltip's arrow; jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderSideNav();
    const settings = within(sections("ru")).getByRole("link", { name: "Настройки" });
    const matches = vi.spyOn(settings, "matches");

    // A dialog closed with the mouse returns focus to its opener: no :focus-visible.
    matches.mockReturnValue(false);
    act(() => settings.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => settings.blur());

    matches.mockReturnValue(true);
    act(() => settings.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("Настройки");
  });

  it("switches zones by opening the other zone's root", () => {
    renderSideNav({ zone: "trainer", activeId: "today" });

    const zones = screen.getByRole("radiogroup", { name: "Зона" });
    expect(within(zones).getByRole("radio", { name: "Тренер" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(within(zones).getByRole("radio", { name: "Клиент" }));
    expect(push).toHaveBeenCalledWith("/client");
  });

  it("opens the profile from the account button, named after the person once signed in", () => {
    const { onOpenProfile } = renderSideNav();

    act(() => setAccount({ status: "signed-out" }));
    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy();

    act(() => setAccount({ status: "signed-in", name: "Давид Петров", photoUrl: null, isTrainer: false, isAdmin: false, botBlocked: false, botUrl: "https://t.me/fitconnection_bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Давид Петров" }));
    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
