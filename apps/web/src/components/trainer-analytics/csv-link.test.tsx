// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { renderWithProviders } from "@/test/render";

const telegram = vi.hoisted(() => ({ available: false, downloads: [] as [string, string][] }));
vi.mock("@/lib/telegram/mini-app", () => ({
  canDownloadInTelegram: () => telegram.available,
  downloadInTelegram: (url: string, fileName: string) => {
    telegram.downloads.push([url, fileName]);
    return telegram.available;
  },
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/sonner", () => ({ toast: { error: toastError } }));

const { CsvLink } = await import("./csv-link");

const HREF = "/api/trainer/export/payments?from=2026-10-01&to=2026-11-01";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  telegram.available = false;
  telegram.downloads = [];
  toastError.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function click() {
  renderWithProviders(<CsvLink href={HREF}>Оплаты</CsvLink>);
  const link = screen.getByRole("link", { name: "Оплаты" });
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(link, event);
  return { link, event };
}

describe("CsvLink", () => {
  it("is a plain download link on the website", () => {
    const { link, event } = click();
    expect(link.getAttribute("href")).toBe(HREF);
    expect(link.hasAttribute("download")).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a signed link and hands it to Telegram's download dialog in the Mini App", async () => {
    telegram.available = true;
    const file = { url: "https://storage.example/sign/exports/u/csv/x.csv?token=t", fileName: "dafit-payments.csv" };
    fetchMock.mockResolvedValue(Response.json(file));
    const { event } = click();
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(telegram.downloads).toEqual([[file.url, file.fileName]]));
    expect(fetchMock).toHaveBeenCalledWith(HREF, { method: "POST" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says so when the file could not be prepared", async () => {
    telegram.available = true;
    fetchMock.mockResolvedValue(Response.json({ error: "export_failed" }, { status: 500 }));
    click();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(dictionaries.ru.trainerAnalytics.csv.failed));
    expect(telegram.downloads).toEqual([]);
  });
});
