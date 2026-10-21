// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { givePublicConsent } from "@/lib/public-data/actions";
import { renderWithProviders } from "@/test/render";
import { PublicConsentSheet } from "./public-consent-sheet";

vi.mock("@/lib/public-data/actions", () => ({ givePublicConsent: vi.fn(), revokePublicConsent: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PublicConsentSheet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preselects nothing for a first consent (152-FZ art. 10.1 part 8)", () => {
    renderWithProviders(<PublicConsentSheet scope="showcase" open onOpenChange={() => {}} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(7);
    expect(boxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(0);
    expect(screen.getByRole("link", { name: "текст согласия" }).getAttribute("href")).toBe("/legal/public-data");
  });

  it("sends the chosen fields, bans and condition, then closes", async () => {
    vi.mocked(givePublicConsent).mockResolvedValue({ status: "done" });
    const onOpenChange = vi.fn();
    const onDone = vi.fn();
    renderWithProviders(<PublicConsentSheet scope="showcase" open onOpenChange={onOpenChange} onDone={onDone} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Фото" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Услуги и цены" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Не показывать в поисковиках" }));
    fireEvent.change(screen.getByLabelText("Своё условие"), { target: { value: " Без репостов " } });
    fireEvent.click(screen.getByRole("button", { name: "Даю согласие" }));
    await waitFor(() =>
      expect(givePublicConsent).toHaveBeenCalledWith({
        scope: "showcase",
        fields: ["photo", "prices"],
        bans: ["no_index"],
        condition: "Без репостов",
        locationIds: [],
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onDone).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Витрина включена");
  });

  it("lists each place with its address, nothing ticked, and sends the ticked ones", async () => {
    vi.mocked(givePublicConsent).mockResolvedValue({ status: "done" });
    const places = [
      { id: "00000000-0000-4000-8000-00000000c001", name: "Студия", address: "Баумана, 5" },
      { id: "00000000-0000-4000-8000-00000000c002", name: "Дом", address: "Садовая, 3, кв. 7" },
    ];
    renderWithProviders(<PublicConsentSheet scope="showcase" open onOpenChange={() => {}} places={places} />);
    expect(screen.getByText("Садовая, 3, кв. 7")).toBeTruthy();
    expect(screen.getByText(/Домашний адрес не отмечай/)).toBeTruthy();
    const studio = screen.getByRole("checkbox", { name: /Студия/ }) as HTMLInputElement;
    expect(studio.checked).toBe(false);
    fireEvent.click(studio);
    fireEvent.click(screen.getByRole("button", { name: "Даю согласие" }));
    await waitFor(() =>
      expect(givePublicConsent).toHaveBeenCalledWith(expect.objectContaining({ locationIds: ["00000000-0000-4000-8000-00000000c001"] })),
    );
  });

  it("refuses a condition over 500 characters", async () => {
    renderWithProviders(<PublicConsentSheet scope="story" open onOpenChange={() => {}} />);
    expect(screen.queryByRole("checkbox", { name: "Фото" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Своё условие"), { target: { value: "а".repeat(501) } });
    fireEvent.click(screen.getByRole("button", { name: "Даю согласие" }));
    expect(await screen.findByText("Не больше 500 знаков")).toBeTruthy();
    expect(givePublicConsent).not.toHaveBeenCalled();
  });

  it("starts from the consent in force when changing it", () => {
    renderWithProviders(
      <PublicConsentSheet
        scope="showcase"
        open
        onOpenChange={() => {}}
        initial={{ fields: ["city"], bans: ["no_transfer"], condition: "Только для записи", locationIds: [], acceptedAt: "2026-10-20T10:00:00Z" }}
      />,
    );
    expect((screen.getByRole("checkbox", { name: "Город" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Фото" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Не передавать другим сайтам" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Своё условие") as HTMLTextAreaElement).value).toBe("Только для записи");
  });
});
