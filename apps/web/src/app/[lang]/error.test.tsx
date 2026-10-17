// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { feedbackHrefFor } from "@/components/errors/error-screen";
import { renderWithProviders } from "@/test/render";
import ErrorBoundary from "./error";

describe("error boundary", () => {
  it("offers to try again and to tell the team, from the screen that failed", async () => {
    window.history.pushState({}, "", "/client/passes");
    const retry = vi.fn();
    renderWithProviders(<ErrorBoundary error={new Error("boom")} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Что-то пошло не так" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать ещё раз" }));
    expect(retry).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Обратная связь" }).getAttribute("href")).toBe("/feedback?from=%2Fclient%2Fpasses"),
    );
  });

  it("speaks the user's language", () => {
    renderWithProviders(<ErrorBoundary error={new Error("boom")} retry={() => {}} />, { locale: "en" });
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send feedback" })).toBeTruthy();
  });

  it("does not send the feedback screen back to itself", () => {
    expect(feedbackHrefFor("/feedback")).toBe("/feedback");
    expect(feedbackHrefFor("")).toBe("/feedback");
  });
});
