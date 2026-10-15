// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { formatLongDate } from "@/i18n/format";
import { renderWithProviders } from "@/test/render";
import { TodayDate } from "./today-date";

// Tuesday morning, local time.
const NOW = new Date(2026, 9, 13, 9, 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const ui = (locale: Locale) => (
  <I18nProvider locale={locale}>
    <p>
      <TodayDate />
    </p>
  </I18nProvider>
);

/** Puts the server HTML into the page and runs its inline script, as the browser does while parsing. */
function loadServerHtml(locale: Locale) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(ui(locale));
  document.body.append(container);
  for (const script of container.querySelectorAll("script")) new Function(script.textContent ?? "")();
  return container;
}

describe("TodayDate", () => {
  it("is empty in the server HTML: prerendered pages can't know the date", () => {
    const html = renderToString(ui("ru"));
    expect(html).toMatch(/<time id="[^"]+"><\/time>/);
  });

  it.each([
    ["ru", "Вторник, 13 октября"],
    ["en", "Tuesday, October 13"],
  ] as const)("the inline script writes the date like formatLongDate (%s)", (locale, expected) => {
    const container = loadServerHtml(locale);
    const time = container.querySelector("time");

    expect(time?.textContent).toBe(expected);
    expect(time?.textContent).toBe(formatLongDate(locale, NOW));
    expect(time?.getAttribute("datetime")).toBe("2026-10-13");
    container.remove();
  });

  it("hydrates over the script's text without a mismatch", async () => {
    const container = loadServerHtml("ru");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();

    const root = await act(async () => hydrateRoot(container, ui("ru"), { onRecoverableError: recoverable }));

    expect(container.querySelector("time")?.textContent).toBe("Вторник, 13 октября");
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("formats the date directly on a client navigation", () => {
    renderWithProviders(<TodayDate />, { locale: "en" });
    const time = screen.getByText("Tuesday, October 13");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe("2026-10-13");
  });

  it("turns to the next day at midnight", () => {
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 30));
    renderWithProviders(<TodayDate />);
    expect(screen.getByText("Вторник, 13 октября")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByText("Среда, 14 октября")).toBeTruthy();
  });
});
