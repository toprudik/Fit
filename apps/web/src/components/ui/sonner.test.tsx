// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInTelegram } from "@/lib/telegram/mini-app";
import { renderWithProviders } from "@/test/render";
import { ACTION_TOAST_DURATION, Toaster, toast } from "./sonner";

vi.mock("@/lib/telegram/mini-app", () => ({ useInTelegram: vi.fn(() => false) }));

const action = { label: "Отменить", onClick: () => {} };

/** The toast as Sonner keeps it, with the options it was shown with. */
function shown(id: string | number) {
  return toast.getToasts().find((item) => item.id === id) as { duration?: number } | undefined;
}

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  vi.mocked(useInTelegram).mockReturnValue(false);
});

describe("toast", () => {
  it("keeps a toast with an action for 6 seconds", () => {
    expect(shown(toast("Списание прощено", { action }))?.duration).toBe(ACTION_TOAST_DURATION);
    expect(shown(toast.success("Записано", { action }))?.duration).toBe(6000);
  });

  it("leaves other toasts on the 4 second default and an explicit duration as given", () => {
    expect(shown(toast.success("Записано"))?.duration).toBeUndefined();
    expect(shown(toast.error("Не получилось", { action, duration: 10_000 }))?.duration).toBe(10_000);
  });
});

describe("Toaster", () => {
  /** Sonner renders its list only while a toast is up, and adds toasts on the next tick. */
  async function showToast() {
    act(() => {
      toast("Записано");
    });
    return (await screen.findByText("Записано")).closest<HTMLElement>("[data-sonner-toaster]");
  }

  it("rises from the bottom on the website, above the tab bar on phones", async () => {
    renderWithProviders(<Toaster />);
    const list = await showToast();

    expect(list?.getAttribute("data-y-position")).toBe("bottom");
    expect(list?.className).toContain("[--toast-offset-bottom:calc(var(--size-tabbar)+var(--safe-bottom)+var(--space-3))]");
    expect(list?.className).toContain("md:[--toast-offset-bottom:var(--space-6)]");
    expect(list?.style.getPropertyValue("--mobile-offset-bottom")).toBe("var(--toast-offset-bottom)");
  });

  it("comes from the top inside Telegram, below the safe area", async () => {
    vi.mocked(useInTelegram).mockReturnValue(true);
    renderWithProviders(<Toaster />);
    const list = await showToast();

    expect(list?.getAttribute("data-y-position")).toBe("top");
    expect(list?.style.getPropertyValue("--mobile-offset-top")).toBe("calc(var(--safe-top) + var(--space-3))");
  });

  it("keeps a named, polite live region", async () => {
    renderWithProviders(<Toaster />, { locale: "en" });
    await showToast();

    const region = document.querySelector("section[aria-live]");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-label")).toMatch(/^Notifications/);
  });
});
