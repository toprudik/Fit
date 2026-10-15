// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount } from "@/components/account/account-store";
import { ShellContext } from "@/components/shell/shell-context";
import type { Locale } from "@/i18n/config";
import type { Zone } from "@/lib/navigation/zones";
import { renderWithProviders } from "@/test/render";
import { ProfilePanel } from "./profile-panel";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/trainer/clients",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** The panel inside the shell, which tells it the zone on screen (null: not known yet). */
function renderPanel({
  zone = "trainer",
  locale = "ru",
  ...props
}: { zone?: Zone | null; locale?: Locale } & React.ComponentProps<typeof ProfilePanel> = {}) {
  return renderWithProviders(
    <ShellContext value={{ zone, openProfile: () => {} }}>
      <ProfilePanel {...props} />
    </ShellContext>,
    { locale },
  );
}

const zoneSwitch = () => screen.getByRole("radiogroup", { name: "Зона" });
const checkedZone = () =>
  within(zoneSwitch())
    .getAllByRole("radio")
    .filter((radio) => radio.getAttribute("aria-checked") === "true")
    .map((radio) => radio.textContent);

beforeEach(() => {
  router.push.mockReset();
  resetAccountStoreForTests();
});

afterEach(() => {
  resetAccountStoreForTests();
});

describe("account", () => {
  it("shows a loading placeholder until the account is known", () => {
    renderPanel();
    expect(screen.getByRole("status", { name: "Загрузка" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Выйти" })).toBeNull();
  });

  it("shows the name and a way to sign out", () => {
    renderPanel();
    act(() => setAccount({ status: "signed-in", name: "Анна Смирнова", photoUrl: null }));

    expect(screen.getByText("Анна Смирнова")).toBeTruthy();
    const signOut = screen.getByRole("button", { name: "Выйти" });
    const form = signOut.closest("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/auth/sign-out");

    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    form?.addEventListener("submit", submit);
    fireEvent.click(signOut);
    expect(submit).toHaveBeenCalledOnce();
  });

  it("offers to sign in when signed out, coming back to the same screen", () => {
    const onNavigate = vi.fn();
    renderPanel({ onNavigate });
    act(() => setAccount({ status: "signed-out" }));

    expect(screen.getByText("Войди через Telegram, и здесь появятся твоё имя и фото.")).toBeTruthy();
    const signIn = screen.getByRole("link", { name: "Войти через Telegram" });
    expect(signIn.getAttribute("href")).toBe("/login?next=%2Ftrainer%2Fclients");
    expect(screen.queryByRole("button", { name: "Выйти" })).toBeNull();

    // Sign-in leaves the shell: the sheet must close before it goes.
    signIn.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(signIn);
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

describe("settings", () => {
  it("closes the sheet as it opens the settings", () => {
    const onNavigate = vi.fn();
    renderPanel({ onNavigate });

    const settings = screen.getByRole("link", { name: "Настройки" });
    expect(settings.getAttribute("href")).toBe("/settings");
    settings.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(settings);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("puts the list on surface-2 when the panel sits on a surface-1 sheet", () => {
    const { container, unmount } = renderPanel({ groupSurface: "raised" });
    expect(container.querySelector("[data-surface]")?.getAttribute("data-surface")).toBe("raised");
    unmount();

    const page = renderPanel();
    expect(page.container.querySelector("[data-surface]")?.getAttribute("data-surface")).toBe("default");
  });
});

describe("zone switch", () => {
  it("shows the zone the shell shows", () => {
    renderPanel({ zone: "trainer" });
    expect(checkedZone()).toEqual(["Тренер"]);
  });

  it("jumps to the zone once the shell knows it, instead of sliding over from the default", () => {
    const view = renderPanel({ zone: null });
    expect(checkedZone()).toEqual(["Клиент"]);

    view.rerender(
      <ShellContext value={{ zone: "trainer", openProfile: () => {} }}>
        <ProfilePanel />
      </ShellContext>,
    );
    expect(checkedZone()).toEqual(["Тренер"]);
  });

  it("opens the other zone and lets the sheet close", () => {
    const onNavigate = vi.fn();
    renderPanel({ zone: "trainer", onNavigate });

    fireEvent.click(screen.getByRole("radio", { name: "Клиент" }));

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/client");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(checkedZone()).toEqual(["Клиент"]);
  });
});

describe("in English", () => {
  it("links to the settings", () => {
    renderPanel({ zone: "client", locale: "en" });

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(within(screen.getByRole("radiogroup", { name: "Zone" })).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Trainer",
      "Client",
    ]);
  });
});
