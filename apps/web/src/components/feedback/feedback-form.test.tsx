// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setAccount } from "@/components/account/account-store";
import { prepareFeedback, sendFeedback } from "@/lib/feedback/actions";
import { renderWithProviders } from "@/test/render";
import { FeedbackForm } from "./feedback-form";

vi.mock("@/lib/feedback/actions", () => ({ prepareFeedback: vi.fn(), sendFeedback: vi.fn() }));
vi.mock("@/lib/supabase/upload", () => ({ uploadToSignedUrl: vi.fn(async () => true) }));

const ID = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

describe("FeedbackForm, a request about my data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
    setAccount({ status: "signed-in", name: "Аня", photoUrl: null, isTrainer: false, isAdmin: false, botBlocked: false, botUrl: "https://t.me/example_bot" });
  });

  it("asks what is needed, hides screenshots and sends the type (152-FZ arts. 20, 21)", async () => {
    vi.mocked(prepareFeedback).mockResolvedValue({ status: "ready", id: ID, uploads: [] });
    vi.mocked(sendFeedback).mockResolvedValue({ status: "sent" });
    renderWithProviders(<FeedbackForm from="/settings" backHref="/settings" />);

    fireEvent.click(screen.getByRole("radio", { name: "Мои данные" }));
    expect(screen.getByText(/в течение 10 рабочих дней/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Добавить скриншот" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: "Удалите старый вес" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Выбери, что нужно")).toBeTruthy();
    expect(sendFeedback).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "Исправить данные" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(sendFeedback).toHaveBeenCalled());
    expect(vi.mocked(prepareFeedback).mock.calls[0][0]).toEqual([]);
    expect(vi.mocked(sendFeedback).mock.calls[0][0]).toMatchObject({ kind: "data_request", requestType: "correction", screenshots: [] });
    expect(await screen.findByText("Ответим в боте в течение 10 рабочих дней.")).toBeTruthy();
  });

  it("sends other feedback without a request type", async () => {
    vi.mocked(prepareFeedback).mockResolvedValue({ status: "ready", id: ID, uploads: [] });
    vi.mocked(sendFeedback).mockResolvedValue({ status: "sent" });
    renderWithProviders(<FeedbackForm from={null} backHref="/" />);
    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: "Кнопка серая" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(sendFeedback).toHaveBeenCalled());
    expect(vi.mocked(sendFeedback).mock.calls[0][0]).toMatchObject({ kind: "bug", requestType: null });
  });
});
