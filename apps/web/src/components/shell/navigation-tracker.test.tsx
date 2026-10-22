// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrival, NavigationTracker, openTab, useBack } from "./navigation-tracker";

const router = { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
let pathname = "/";

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));

afterEach(cleanup);

/** Moves the browser to `url` the way the Next router does, then lets the tracker see the new pathname. */
function navigate(rerender: () => void, url: string, { pop = false } = {}) {
  if (pop) {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } else {
    window.history.pushState(null, "", url);
  }
  pathname = new URL(url, window.location.origin).pathname;
  act(rerender);
}

describe("useBack", () => {
  // Module state is shared, so this is one story from the first page load on.
  it("goes back only within the app and falls back to the given screen otherwise", () => {
    window.history.replaceState(null, "", "/settings");
    pathname = "/settings";
    expect(arrival()).toBe("load");

    const tracker = render(<NavigationTracker />);
    const rerender = () => tracker.rerender(<NavigationTracker />);
    const back = renderHook(() => useBack("/trainer")).result;

    // Opened directly: nothing of ours behind it. The fallback screen comes up like a pop.
    back.current();
    expect(router.push).toHaveBeenCalledWith("/trainer");
    expect(router.back).not.toHaveBeenCalled();
    expect(arrival()).toBe("pop");
    router.push.mockClear();

    navigate(rerender, "/trainer/clients?filter=debt");
    expect(arrival()).toBe("push");
    back.current();
    expect(router.back).toHaveBeenCalledOnce();
    router.back.mockClear();

    // The browser's back button returns to the first page: back to square one.
    navigate(rerender, "/settings", { pop: true });
    back.current();
    expect(router.push).toHaveBeenCalledWith("/trainer");
    expect(router.back).not.toHaveBeenCalled();
    router.push.mockClear();

    // Forward again restores the entry, so Back works again.
    navigate(rerender, "/trainer/clients?filter=debt", { pop: true });
    back.current();
    expect(router.back).toHaveBeenCalledOnce();
  });

  it("goes up from a tab reopened on its last screen, and back from a screen of another tab opened by a link", () => {
    const tracker = render(<NavigationTracker />);
    const rerender = () => tracker.rerender(<NavigationTracker />);
    const back = renderHook(() => useBack("/client/progress")).result;
    // A back/forward to an unknown page starts the history over from «Главная».
    navigate(rerender, "/client?start", { pop: true });

    // «Прогресс» from the tab bar, then «Цель и норма питания», a screen of «Дневник», by its link.
    openTab(router as never, "/client/progress", { replace: false });
    navigate(rerender, "/client/progress");
    navigate(rerender, "/client/diary/food/target");
    back.current();
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
    navigate(rerender, "/client/progress", { pop: true });
    router.back.mockClear();

    // «Дневник» from the tab bar, reopened on its last screen: up to its root in place of the screen.
    openTab(router as never, "/client/diary/food", { replace: true });
    navigate(rerender, "/client/diary/food");
    renderHook(() => useBack("/client/diary")).result.current();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenLastCalledWith("/client/diary", { scroll: false });
  });

  it("tells a back/forward arrival from a push while the screen mounts", () => {
    render(<NavigationTracker />);
    window.history.pushState(null, "", "/client");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(arrival()).toBe("pop");
  });
});

describe("arrival", () => {
  /** Changes the URL like the router does and reports how the shell would see the new screen arrive. */
  function arriveAt(rerender: () => void, url: string, { pop = false } = {}) {
    if (pop) {
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      window.history.pushState(null, "", url);
    }
    // The shell reads it in a layout effect, before the tracker records the new URL.
    const seen = arrival();
    pathname = new URL(url, window.location.origin).pathname;
    act(rerender);
    return seen;
  }

  it("is a push forward and a pop back", () => {
    const tracker = render(<NavigationTracker />);
    const rerender = () => tracker.rerender(<NavigationTracker />);

    expect(arriveAt(rerender, "/trainer")).toBe("push");
    expect(arriveAt(rerender, "/settings")).toBe("push");
    expect(arriveAt(rerender, "/trainer", { pop: true })).toBe("pop");
    // The browser's forward button opens again what Back closed.
    expect(arriveAt(rerender, "/settings", { pop: true })).toBe("push");
  });

  it("knows a back navigation the router renders inside the popstate event, before our listener runs", () => {
    // Like Next.js: its listener is there first, and React renders a popstate transition at once.
    let seen: string | null = null;
    let rerender = () => {};
    const routerListener = () => {
      seen = arrival();
      pathname = window.location.pathname;
      act(rerender);
    };
    window.addEventListener("popstate", routerListener);
    const tracker = render(<NavigationTracker />);
    rerender = () => tracker.rerender(<NavigationTracker />);

    window.history.pushState(null, "", "/client/diary");
    pathname = "/client/diary";
    act(rerender);
    window.history.pushState(null, "", "/settings");
    pathname = "/settings";
    act(rerender);

    window.history.replaceState(null, "", "/client/diary");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.removeEventListener("popstate", routerListener);
    expect(seen).toBe("pop");

    // Nothing stale is left behind: the next screen opened is a push again, and Back still works.
    window.history.pushState(null, "", "/client/diary?day=2");
    expect(arrival()).toBe("push");
  });
});
