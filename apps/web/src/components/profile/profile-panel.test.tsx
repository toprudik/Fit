// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount } from "@/components/account/account-store";
import { ZONE_COOKIE } from "@/lib/navigation/zones";
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

const zoneSwitch = () => screen.getByRole("radiogroup", { name: "Зона" });
const checkedZone = () =>
  within(zoneSwitch())
    .getAllByRole("radio")
    .filter((radio) => radio.getAttribute("aria-checked") === "true")
    .map((radio) => radio.textContent);

beforeEach(() => {
  router.push.mockReset();
  document.cookie = `${ZONE_COOKIE}=; Path=/; Max-Age=0`;
  resetAccountStoreForTests();
});

afterEach(() => {
  resetAccountStoreForTests();
});

describe("account", () => {
  it("shows a loading placeholder until the account is known", () => {
    renderWithProviders(<ProfilePanel zone="trainer" />);
    expect(screen.getByRole("status", { name: "Загрузка" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Выйти" })).toBeNull();
  });

  it("shows the name and a way to sign out", () => {
    renderWithProviders(<ProfilePanel zone="trainer" />);
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
    renderWithProviders(<ProfilePanel zone="trainer" />);
    act(() => setAccount({ status: "signed-out" }));

    expect(screen.getByText("Войди через Telegram, и здесь появятся твоё имя и фото.")).toBeTruthy();
    const signIn = screen.getByRole("link", { name: "Войти через Telegram" });
    expect(signIn.getAttribute("href")).toBe("/login?next=%2Ftrainer%2Fclients");
    expect(screen.queryByRole("button", { name: "Выйти" })).toBeNull();
  });
});

describe("zone switch", () => {
  it("shows the zone the profile was opened from", () => {
    renderWithProviders(<ProfilePanel zone="trainer" />);
    expect(checkedZone()).toEqual(["Тренер"]);
  });

  it("shows the zone visited last on the profile page", () => {
    document.cookie = `${ZONE_COOKIE}=trainer; Path=/`;
    renderWithProviders(<ProfilePanel zone={null} />);
    expect(checkedZone()).toEqual(["Тренер"]);
  });

  it("opens the other zone and lets the sheet close", () => {
    const onNavigate = vi.fn();
    renderWithProviders(<ProfilePanel zone="trainer" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("radio", { name: "Клиент" }));

    expect(router.push).toHaveBeenCalledExactlyOnceWith("/client");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(checkedZone()).toEqual(["Клиент"]);
  });
});

describe("in English", () => {
  it("links to the settings", () => {
    renderWithProviders(<ProfilePanel zone="client" />, { locale: "en" });

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(within(screen.getByRole("radiogroup", { name: "Zone" })).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Trainer",
      "Client",
    ]);
  });
});
