// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInWatch, WATCH_MS } from "./check-in-watch";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const loadSessionMarks = vi.fn<(sessionId: string) => Promise<string | null>>();
vi.mock("@/lib/check-in/actions", () => ({ loadSessionMarks: (sessionId: string) => loadSessionMarks(sessionId) }));

const SESSION = "33333333-3333-4333-8333-333333333333";
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  router.refresh.mockReset();
  loadSessionMarks.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("CheckInWatch", () => {
  it("re-renders the page when someone checks in", async () => {
    loadSessionMarks.mockResolvedValueOnce("b1:confirmed").mockResolvedValue("b1:attended");
    render(<CheckInWatch sessionId={SESSION} marks="b1:confirmed" />);

    await wait(WATCH_MS);
    expect(loadSessionMarks).toHaveBeenCalledWith(SESSION);
    expect(router.refresh).not.toHaveBeenCalled();

    await wait(WATCH_MS);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("asks nothing while the tab is hidden and asks again when it is back", async () => {
    visibility = "hidden";
    loadSessionMarks.mockResolvedValue("b1:attended");
    render(<CheckInWatch sessionId={SESSION} marks="b1:confirmed" />);

    await wait(WATCH_MS * 3);
    expect(loadSessionMarks).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the page as it is when the attendance cannot be read", async () => {
    loadSessionMarks.mockResolvedValue(null);
    render(<CheckInWatch sessionId={SESSION} marks="b1:confirmed" />);

    await wait(WATCH_MS * 2);
    expect(loadSessionMarks).toHaveBeenCalledTimes(2);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("stops asking once the page leaves", async () => {
    loadSessionMarks.mockResolvedValue("b1:confirmed");
    const { unmount } = render(<CheckInWatch sessionId={SESSION} marks="b1:confirmed" />);
    unmount();

    await wait(WATCH_MS * 2);
    expect(loadSessionMarks).not.toHaveBeenCalled();
  });
});
