// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrival, NavigationTracker, useBack } from "./navigation-tracker";

const router = { back: vi.fn(), push: vi.fn() };
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

    // Opened directly: nothing of ours behind it.
    back.current();
    expect(router.push).toHaveBeenCalledWith("/trainer");
    expect(router.back).not.toHaveBeenCalled();
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

  it("tells a back/forward arrival from a push while the screen mounts", () => {
    render(<NavigationTracker />);
    window.history.pushState(null, "", "/client");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(arrival()).toBe("pop");
  });
});
