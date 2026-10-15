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

function renderSideNav({ zone = "trainer", activeId = null, locale = "ru" }: { zone?: Zone; activeId?: TabId | null; locale?: Locale } = {}) {
  const onOpenProfile = vi.fn();
  // The narrow menu labels its icons with tooltips, which need the provider from the root layout.
  renderWithProviders(
    <TooltipProvider>
      <SideNav zone={zone} activeId={activeId} onOpenProfile={onOpenProfile} />
    </TooltipProvider>,
    { locale },
  );
  return { onOpenProfile };
}

function sections(locale: Locale) {
  return screen.getByRole("navigation", { name: SECTIONS_LABEL[locale] });
}

afterEach(() => {
  push.mockReset();
  resetAccountStoreForTests();
});

describe("SideNav", () => {
  for (const locale of LOCALES) {
    for (const zone of ZONES) {
      const expected = EXPECTED_TABS[locale][zone];

      it(`lists the ${zone} zone's sections in ${locale}, linking to the tab roots`, () => {
        renderSideNav({ zone, locale });

        const links = within(sections(locale)).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(expected.map(([label]) => label));
        expect(links.map((link) => link.getAttribute("href"))).toEqual(expected.map(([, href]) => href));
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

    act(() => setAccount({ status: "signed-in", name: "Давид Петров", photoUrl: null }));
    fireEvent.click(screen.getByRole("button", { name: "Давид Петров" }));
    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
