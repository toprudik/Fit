// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { reportContent, reportShowcase } from "@/lib/reports/actions";
import { renderWithProviders } from "@/test/render";
import { ReportButton } from "./report-button";

vi.mock("@/lib/reports/actions", () => ({ reportContent: vi.fn(), reportShowcase: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMMENT = "3f6b2a1c-9d4e-4f8a-b7c6-5e4d3c2b1a09";

function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Пожаловаться" }));
}

describe("ReportButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for a reason before sending", async () => {
    renderWithProviders(<ReportButton target={{ kind: "content", targetType: "food_comment", targetId: COMMENT }} />);
    openSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Отправить жалобу" }));
    expect(await screen.findByText("Выбери, что не так")).toBeTruthy();
    expect(reportContent).not.toHaveBeenCalled();
  });

  it("sends the reason and details for content and shows the receipt", async () => {
    vi.mocked(reportContent).mockResolvedValue({ status: "sent" });
    renderWithProviders(<ReportButton target={{ kind: "content", targetType: "food_comment", targetId: COMMENT }} />);
    openSheet();
    fireEvent.click(await screen.findByRole("radio", { name: "Спам или реклама" }));
    fireEvent.change(screen.getByLabelText("Подробнее"), { target: { value: "  Ссылка на чужой магазин " } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить жалобу" }));
    await waitFor(() =>
      expect(reportContent).toHaveBeenCalledWith({ targetType: "food_comment", targetId: COMMENT, reason: "spam", body: "Ссылка на чужой магазин" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Жалобу отправили. Что решим, напишем в бот."));
  });

  it("refuses overlong details without calling the server", async () => {
    renderWithProviders(<ReportButton target={{ kind: "content", targetType: "review_reply", targetId: COMMENT }} />);
    openSheet();
    fireEvent.click(await screen.findByRole("radio", { name: "Оскорбление" }));
    fireEvent.change(screen.getByLabelText("Подробнее"), { target: { value: "а".repeat(2001) } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить жалобу" }));
    expect(await screen.findByText("Не больше 2000 знаков")).toBeTruthy();
    expect(reportContent).not.toHaveBeenCalled();
  });

  it("asks for a contact on a public showcase and sends it", async () => {
    vi.mocked(reportShowcase).mockResolvedValue({ status: "sent" });
    renderWithProviders(<ReportButton target={{ kind: "showcase", slug: "anna-fit" }} />);
    openSheet();
    fireEvent.click(await screen.findByRole("radio", { name: "Неправда" }));
    fireEvent.change(screen.getByLabelText("Как тебе ответить"), { target: { value: "reader@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить жалобу" }));
    await waitFor(() =>
      expect(reportShowcase).toHaveBeenCalledWith({ slug: "anna-fit", reason: "false_facts", body: undefined, contact: "reader@example.com" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Жалобу отправили. Спасибо."));
  });

  it("explains the daily limit", async () => {
    vi.mocked(reportContent).mockResolvedValue({ status: "limit" });
    renderWithProviders(<ReportButton target={{ kind: "content", targetType: "challenge_alias", targetId: COMMENT }} />);
    openSheet();
    expect(screen.queryByLabelText("Как тебе ответить")).toBeNull();
    fireEvent.click(await screen.findByRole("radio", { name: "Другое" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить жалобу" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Жалоб сегодня уже много. Попробуй завтра."));
  });
});
