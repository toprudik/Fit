// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hapticImpact,
  markMiniAppReady,
  resetMiniAppForTests,
  safely,
  safelyAsync,
  useInTelegram,
  useTelegramBackButton,
  useTelegramVerticalSwipeLock,
} from "./mini-app";

const sdk = vi.hoisted(() => {
  let backListener: (() => void) | null = null;
  return {
    backButton: {
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn((listener: () => void) => {
        backListener = listener;
        return () => {
          backListener = null;
        };
      }),
      press: () => backListener?.(),
    },
    hapticFeedback: { impactOccurred: vi.fn(), selectionChanged: vi.fn() },
    swipeBehavior: { enableVertical: vi.fn(), disableVertical: vi.fn() },
  };
});
vi.mock("@tma.js/sdk-react", () => sdk);

/** Whether the latest call left Telegram's vertical swipes on (undefined: nothing was called). */
function verticalSwipesOn() {
  const enabled = sdk.swipeBehavior.enableVertical.mock.invocationCallOrder.at(-1) ?? 0;
  const disabled = sdk.swipeBehavior.disableVertical.mock.invocationCallOrder.at(-1) ?? 0;
  if (!enabled && !disabled) return undefined;
  return enabled > disabled;
}

/** What the provider does once the SDK is mounted; forgets the calls that sync the idle state. */
function goLive() {
  markMiniAppReady();
  vi.clearAllMocks();
}

beforeEach(() => {
  resetMiniAppForTests();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("safely", () => {
  it("returns what the call returns", () => {
    expect(safely(() => 42)).toBe(42);
  });

  it("turns a throw into undefined and warns only in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fail = () => {
      throw new Error("unsupported");
    };

    vi.stubEnv("NODE_ENV", "production");
    expect(safely(fail)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "development");
    expect(safely(fail)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("has an async twin that resolves to undefined on a rejection", async () => {
    expect(await safelyAsync(() => Promise.resolve("ok"))).toBe("ok");
    expect(await safelyAsync(() => Promise.reject(new Error("no bridge")))).toBeUndefined();
  });
});

describe("outside Telegram", () => {
  it("reports the website and leaves the SDK alone", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { result } = renderHook(() => {
      useTelegramBackButton(() => {});
      useTelegramVerticalSwipeLock(true);
      return useInTelegram();
    });
    hapticImpact();

    expect(result.current).toBe(false);
    expect(sdk.backButton.show).not.toHaveBeenCalled();
    expect(verticalSwipesOn()).toBeUndefined();
    expect(sdk.hapticFeedback.impactOccurred).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe("inside Telegram", () => {
  it("flips useInTelegram once the provider marks the Mini App ready", () => {
    const { result } = renderHook(() => useInTelegram());
    expect(result.current).toBe(false);
    act(() => markMiniAppReady());
    expect(result.current).toBe(true);
  });

  it("starts from the idle state: BackButton hidden, vertical swipes on", () => {
    markMiniAppReady();
    expect(sdk.backButton.hide).toHaveBeenCalledOnce();
    expect(verticalSwipesOn()).toBe(true);
  });

  it("gives the BackButton press to the newest holder and hides it when the last one lets go", () => {
    goLive();
    const screen = vi.fn();
    const sheet = vi.fn();
    const pushed = renderHook(() => useTelegramBackButton(screen));
    const overlay = renderHook(({ open }) => useTelegramBackButton(open ? sheet : null), { initialProps: { open: true } });

    expect(sdk.backButton.show).toHaveBeenCalled();
    sdk.backButton.press();
    expect(sheet).toHaveBeenCalledOnce();
    expect(screen).not.toHaveBeenCalled();

    overlay.rerender({ open: false });
    sdk.backButton.press();
    expect(screen).toHaveBeenCalledOnce();
    expect(sdk.backButton.hide).not.toHaveBeenCalled();

    pushed.unmount();
    expect(sdk.backButton.hide).toHaveBeenCalledOnce();
  });

  it("turns vertical swipes off while any lock is held and back on when the last one is released", () => {
    goLive();
    const first = renderHook(({ active }) => useTelegramVerticalSwipeLock(active), { initialProps: { active: false } });
    expect(verticalSwipesOn()).toBeUndefined();

    first.rerender({ active: true });
    expect(verticalSwipesOn()).toBe(false);

    const second = renderHook(() => useTelegramVerticalSwipeLock(true));
    first.rerender({ active: false });
    expect(verticalSwipesOn()).toBe(false);

    second.unmount();
    expect(verticalSwipesOn()).toBe(true);
  });

  it("applies a lock taken before the SDK was ready", () => {
    renderHook(() => useTelegramVerticalSwipeLock(true));
    expect(verticalSwipesOn()).toBeUndefined();

    markMiniAppReady();
    expect(verticalSwipesOn()).toBe(false);
  });

  it("keeps going when the client lacks a feature", () => {
    goLive();
    sdk.swipeBehavior.disableVertical.mockImplementationOnce(() => {
      throw new Error("unsupported in Mini Apps version 6.0");
    });
    sdk.hapticFeedback.impactOccurred.mockImplementationOnce(() => {
      throw new Error("unsupported in Mini Apps version 6.0");
    });

    expect(() => renderHook(() => useTelegramVerticalSwipeLock(true))).not.toThrow();
    expect(() => hapticImpact()).not.toThrow();
  });
});
