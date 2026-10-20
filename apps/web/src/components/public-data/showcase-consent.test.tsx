// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokePublicConsent } from "@/lib/public-data/actions";
import { renderWithProviders } from "@/test/render";
import { ShowcaseConsent } from "./showcase-consent";

vi.mock("@/lib/public-data/actions", () => ({ givePublicConsent: vi.fn(), revokePublicConsent: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PLACES = [
  { id: "00000000-0000-4000-8000-00000000c001", name: "Студия", address: "Баумана, 5" },
  { id: "00000000-0000-4000-8000-00000000c002", name: "Парк", address: null },
];
const CONSENT = {
  fields: ["photo" as const, "locations" as const],
  bans: [],
  condition: null,
  locationIds: ["00000000-0000-4000-8000-00000000c001"],
  acceptedAt: "2026-10-20T10:00:00Z",
};

describe("ShowcaseConsent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for the consent before switching the showcase on", async () => {
    renderWithProviders(<ShowcaseConsent visible={false} consent={null} />);
    expect(screen.queryByRole("button", { name: "Выключить витрину" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Включить витрину" }));
    expect(await screen.findByRole("dialog", { name: "Согласие на публикацию" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Фото" })).toBeTruthy();
  });

  it("revokes the consent when switching the showcase off", async () => {
    vi.mocked(revokePublicConsent).mockResolvedValue({ status: "done" });
    renderWithProviders(<ShowcaseConsent visible consent={CONSENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Выключить витрину" }));
    await waitFor(() => expect(revokePublicConsent).toHaveBeenCalledWith("showcase"));
  });

  it("changes the fields starting from the consent in force", async () => {
    renderWithProviders(<ShowcaseConsent visible consent={CONSENT} places={PLACES} />);
    fireEvent.click(screen.getByRole("button", { name: "Изменить, что на витрине" }));
    const photo = await screen.findByRole("checkbox", { name: "Фото" });
    expect((photo as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Студия/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Парк/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("says which places added since the consent stay off the showcase", () => {
    renderWithProviders(<ShowcaseConsent visible consent={CONSENT} places={PLACES} />);
    expect(screen.getByRole("heading", { name: "Новые места не на витрине" })).toBeTruthy();
    expect(screen.getByText(/Сейчас скрыты: Парк$/)).toBeTruthy();
  });

  it("says nothing about places while the showcase is off", () => {
    renderWithProviders(<ShowcaseConsent visible={false} consent={null} places={PLACES} />);
    expect(screen.queryByRole("heading", { name: "Новые места не на витрине" })).toBeNull();
  });
});
