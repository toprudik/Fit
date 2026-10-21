// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBotMessages } from "@/lib/consent/bot-actions";
import { askWriteAccess } from "@/lib/telegram/write-access";
import { renderWithProviders } from "@/test/render";
import { BotMessagesStep } from "./bot-messages-step";

vi.mock("@/lib/consent/bot-actions", () => ({ setBotMessages: vi.fn() }));
vi.mock("@/lib/telegram/write-access", () => ({ askWriteAccess: vi.fn() }));
vi.mock("@/lib/telegram/mini-app", () => ({ useInTelegram: () => true }));

describe("BotMessagesStep", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(setBotMessages).mockReset().mockResolvedValue(true);
    vi.mocked(askWriteAccess).mockReset();
  });

  it("keeps Telegram's answer after the reload a language change makes (QA T3)", async () => {
    vi.mocked(askWriteAccess).mockResolvedValue("allowed");
    renderWithProviders(<BotMessagesStep botUrl="https://t.me/example_bot" />);
    fireEvent.click(screen.getByRole("button", { name: "Разрешить сообщения" }));
    expect(await screen.findByText("Бот может тебе писать.")).toBeTruthy();
    expect(setBotMessages).toHaveBeenCalledWith(true);

    cleanup();
    renderWithProviders(<BotMessagesStep botUrl="https://t.me/example_bot" />);
    expect(screen.getByText("Бот может тебе писать.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Разрешить сообщения" })).toBeNull();
  });

  it("offers the button when nothing was answered yet", () => {
    renderWithProviders(<BotMessagesStep botUrl="https://t.me/example_bot" />);
    expect(screen.getByRole("button", { name: "Разрешить сообщения" })).toBeTruthy();
  });
});
