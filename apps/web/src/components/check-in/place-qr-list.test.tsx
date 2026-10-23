// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";

const telegram = vi.hoisted(() => ({ available: false, downloads: [] as [string, string][] }));
vi.mock("@/lib/telegram/mini-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram/mini-app")>()),
  canDownloadInTelegram: () => telegram.available,
  downloadInTelegram: (url: string, fileName: string) => {
    telegram.downloads.push([url, fileName]);
    return telegram.available;
  },
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
const actions = vi.hoisted(() => ({
  loadPlaceQr: vi.fn(async () => ({ status: "done" as const, qrSvg: "<svg/>" })),
  placeQrDownload: vi.fn(async (): Promise<{ status: "done"; url: string } | { status: "error" }> => ({
    status: "done",
    url: "https://storage.example/sign/exports/u/qr/x.png?token=t",
  })),
}));
vi.mock("@/lib/check-in/actions", () => actions);

const { PlaceQrList } = await import("./place-qr-list");

const PLACE = { id: "00000000-0000-4000-8000-000000000003", name: "Зал", address: null };

beforeEach(() => {
  telegram.available = false;
  telegram.downloads = [];
  toastError.mockReset();
  actions.placeQrDownload.mockClear();
});

async function clickSave() {
  renderWithProviders(<PlaceQrList places={[PLACE]} />);
  fireEvent.click(screen.getByText("Зал"));
  const link = await screen.findByRole("link", { name: "Сохранить для печати" });
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(link, event);
  return { link, event };
}

describe("PlaceQrList", () => {
  it("saves the SVG through a plain download link on the website", async () => {
    const { link, event } = await clickSave();
    expect(link.getAttribute("href")).toMatch(/^data:image\/svg\+xml/);
    expect(link.getAttribute("download")).toBe("QR Зал.svg");
    expect(event.defaultPrevented).toBe(false);
    expect(actions.placeQrDownload).not.toHaveBeenCalled();
  });

  it("hands a signed PNG link to Telegram's download dialog in the Mini App", async () => {
    telegram.available = true;
    const { event } = await clickSave();
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(telegram.downloads).toEqual([["https://storage.example/sign/exports/u/qr/x.png?token=t", "QR Зал.png"]]),
    );
    expect(actions.placeQrDownload).toHaveBeenCalledWith(PLACE.id, "QR Зал.png");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says so when the copy could not be made", async () => {
    telegram.available = true;
    actions.placeQrDownload.mockResolvedValueOnce({ status: "error" });
    await clickSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Не получилось сохранить QR, попробуй ещё раз."));
    expect(telegram.downloads).toEqual([]);
  });
});
