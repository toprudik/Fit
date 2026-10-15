// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTelegramBackButton, useTelegramVerticalSwipeLock } from "@/lib/telegram/mini-app";
import { renderWithProviders } from "@/test/render";
import { Sheet } from "./sheet";

vi.mock("@/lib/telegram/mini-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram/mini-app")>()),
  useTelegramBackButton: vi.fn(),
  useTelegramVerticalSwipeLock: vi.fn(),
}));

// Long enough for the 400ms exit animation to finish and the content to unmount.
const EXIT = { timeout: 2000 };

/** Opens the sheet from a button of its own, like the app does (no Dialog.Trigger). */
function Harness({ description, onOpenChange }: { description?: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Профиль"
        description={description}
        actions={<button type="button">Выйти</button>}
      >
        <p>Настройки и зона</p>
      </Sheet>
    </>
  );
}

function openSheet() {
  const opener = screen.getByRole("button", { name: "Открыть" });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole("dialog", { name: "Профиль" }) };
}

/** Radix starts listening for outside pointer events one tick after the sheet opens. */
async function nextTick() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe("Sheet", () => {
  beforeEach(() => {
    vi.mocked(useTelegramBackButton).mockClear();
    vi.mocked(useTelegramVerticalSwipeLock).mockClear();
  });

  it("stays out of the page until opened, then shows a dialog named by its title", () => {
    renderWithProviders(<Harness description="Аккаунт и настройки" />);
    expect(screen.queryByRole("dialog")).toBeNull();

    const { dialog } = openSheet();

    expect(screen.getByRole("heading", { name: "Профиль" })).toBeTruthy();
    expect(dialog.textContent).toContain("Настройки и зона");
    expect(screen.getByRole("button", { name: "Выйти" })).toBeTruthy();
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toBe("Аккаунт и настройки");
  });

  it("is not described by anything when there is no description", () => {
    renderWithProviders(<Harness />);
    const { dialog } = openSheet();
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
  });

  it("moves focus inside, closes on Escape after its exit animation and returns focus to the opener", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} />);
    const { opener, dialog } = openSheet();

    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    // The content stays mounted, marked closed, while it animates out.
    expect(dialog.isConnected).toBe(true);
    expect(dialog.getAttribute("data-state")).toBe("closed");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), EXIT);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes from the close button, labelled in the current language", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} />, { locale: "en" });
    openSheet();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), EXIT);
  });

  it("closes on a tap on the scrim", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} />);
    openSheet();
    await nextTick();

    const scrim = document.querySelector<HTMLElement>("[data-slot='sheet-scrim']");
    expect(scrim).toBeTruthy();
    fireEvent.pointerDown(scrim!, { button: 0 });
    fireEvent.pointerUp(scrim!, { button: 0 });
    fireEvent.click(scrim!);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), EXIT);
  });

  it("holds Telegram's BackButton only while open, and the button closes it", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<Harness onOpenChange={onOpenChange} />);
    const backHandler = () => vi.mocked(useTelegramBackButton).mock.lastCall?.[0];

    expect(backHandler()).toBeNull();

    openSheet();
    const onBack = backHandler();
    expect(onBack).toBeTypeOf("function");

    act(() => onBack?.());

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(backHandler()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), EXIT);
  });

  it("keeps Telegram's vertical swipes locked only while open", async () => {
    renderWithProviders(<Harness />);
    const locked = () => vi.mocked(useTelegramVerticalSwipeLock).mock.lastCall?.[0];

    expect(locked()).toBe(false);

    openSheet();
    expect(locked()).toBe(true);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(locked()).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), EXIT);
  });
});
