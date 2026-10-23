// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canDownloadInTelegram,
  downloadInTelegram,
  hapticImpact,
  markMiniAppReady,
  type MiniAppSignInResult,
  resetMiniAppForTests,
  safely,
  safelyAsync,
  setMiniAppSignIn,
  signInToMiniApp,
  useInTelegram,
  useMiniAppSignIn,
  useMiniAppSignInNow,
  useTelegramBackButton,
  useTelegramBackFallback,
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
    downloadFile: Object.assign(vi.fn(() => Promise.resolve()), { isAvailable: vi.fn(() => true) }),
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

describe("downloadInTelegram", () => {
  const url = "https://files.example/export/part-1.zip?token=x";

  it("hands the file to Telegram's download dialog inside the Mini App", () => {
    goLive();
    expect(downloadInTelegram(url, "dafit-export.zip")).toBe(true);
    expect(sdk.downloadFile).toHaveBeenCalledWith(url, "dafit-export.zip");
  });

  it("leaves the link to the browser outside Telegram and in a Telegram without the method", () => {
    expect(canDownloadInTelegram()).toBe(false);
    expect(downloadInTelegram(url, "dafit-export.zip")).toBe(false);
    goLive();
    expect(canDownloadInTelegram()).toBe(true);
    sdk.downloadFile.isAvailable.mockReturnValueOnce(false);
    expect(downloadInTelegram(url, "dafit-export.zip")).toBe(false);
    expect(sdk.downloadFile).not.toHaveBeenCalled();
  });
});

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

  it("falls back to the shell's handler when no screen holds the BackButton, and hides it on a root", () => {
    goLive();
    const fallback = vi.fn();
    const screen = vi.fn();
    const shell = renderHook(({ root }) => useTelegramBackFallback(root ? null : fallback), { initialProps: { root: false } });

    expect(sdk.backButton.show).toHaveBeenCalled();
    sdk.backButton.press();
    expect(fallback).toHaveBeenCalledOnce();

    const pushed = renderHook(() => useTelegramBackButton(screen));
    sdk.backButton.press();
    expect(screen).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();

    pushed.unmount();
    expect(sdk.backButton.hide).not.toHaveBeenCalled();
    shell.rerender({ root: true });
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

describe("sign-in from initData", () => {
  /** A stand-in for the provider's request: resolve it with the server's answer. */
  function sender() {
    const answers: ((result: MiniAppSignInResult) => void)[] = [];
    const send = vi.fn(() => new Promise<MiniAppSignInResult>((resolve) => answers.push(resolve)));
    return { send, answer: (result: MiniAppSignInResult) => answers.shift()?.(result) };
  }

  it("is null on the website", () => {
    expect(renderHook(() => useMiniAppSignIn()).result.current).toBeNull();
  });

  it("is pending while the request is on its way, then tells how it went", async () => {
    const { send, answer } = sender();
    const { result } = renderHook(() => useMiniAppSignIn());
    act(() => setMiniAppSignIn(send));

    let signIn: Promise<MiniAppSignInResult> | undefined;
    act(() => {
      signIn = signInToMiniApp();
    });
    expect(result.current).toBe("pending");

    await act(async () => answer("signed-in"));
    expect(await signIn).toBe("signed-in");
    expect(result.current).toBe("signed-in");
  });

  it("joins the sign-in on its way instead of sending initData twice, and sends again once it settled", async () => {
    const { send, answer } = sender();
    setMiniAppSignIn(send);

    const first = signInToMiniApp();
    const joined = signInToMiniApp();
    expect(send).toHaveBeenCalledOnce();
    answer("failed");
    expect(await first).toBe("failed");
    expect(await joined).toBe("failed");

    const retry = signInToMiniApp();
    expect(send).toHaveBeenCalledTimes(2);
    answer("signed-in");
    expect(await retry).toBe("signed-in");
  });

  it("asks to reopen the app when there is no initData to send", async () => {
    const { result } = renderHook(() => useMiniAppSignIn());
    act(() => setMiniAppSignIn(null));

    expect(result.current).toBe("reopen");
    expect(await signInToMiniApp()).toBe("reopen");
    expect(result.current).toBe("reopen");
  });

  /*
   * /login needs to know whether the session exists now. An answer from earlier on this page load says
   * nothing about that: the session may have expired since, or a sign-out on the website ended it.
   */
  describe("for a screen that needs the session now", () => {
    it("asks again over an earlier answer and follows only the new one", async () => {
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      const earlier = signInToMiniApp();
      answer("signed-in");
      await earlier;

      const { result } = renderHook(() => useMiniAppSignInNow());
      expect(result.current).toBe("pending");
      expect(send).toHaveBeenCalledTimes(2);

      await act(async () => answer("signed-in"));
      expect(result.current).toBe("signed-in");
    });

    it("never shows the earlier answer, even before asking again", () => {
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      void signInToMiniApp();
      answer("failed");

      const seen: (string | null)[] = [];
      renderHook(() => seen.push(useMiniAppSignInNow()));
      expect(seen).not.toContain("failed");
    });

    it("tells a new failure", async () => {
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      void signInToMiniApp();
      await act(async () => answer("signed-in"));

      const { result } = renderHook(() => useMiniAppSignInNow());
      await act(async () => answer("failed"));
      expect(result.current).toBe("failed");
    });

    it("follows a sign-in already on its way instead of sending another", async () => {
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      void signInToMiniApp();

      const { result } = renderHook(() => useMiniAppSignInNow());
      expect(result.current).toBe("pending");
      await act(async () => answer("signed-in"));
      expect(result.current).toBe("signed-in");
      expect(send).toHaveBeenCalledOnce();
    });

    it("waits for the first sign-in of the page load", async () => {
      const { send, answer } = sender();
      const { result } = renderHook(() => useMiniAppSignInNow());
      expect(result.current).toBeNull();

      act(() => {
        setMiniAppSignIn(send);
        void signInToMiniApp();
      });
      await act(async () => answer("signed-in"));
      expect(result.current).toBe("signed-in");
      expect(send).toHaveBeenCalledOnce();
    });

    it("asks again on every visit", async () => {
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      const first = renderHook(() => useMiniAppSignInNow());
      void signInToMiniApp();
      await act(async () => answer("signed-in"));
      expect(first.result.current).toBe("signed-in");
      first.unmount();

      const second = renderHook(() => useMiniAppSignInNow());
      expect(second.result.current).toBe("pending");
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("takes the answers of the page load when the screen came with it", async () => {
      // /login opened by a full page load: the provider's sign-in may answer before /login hydrates.
      function Screen() {
        return createElement("p", null, useMiniAppSignInNow() ?? "none");
      }
      const container = document.createElement("div");
      container.innerHTML = renderToString(createElement(Screen));
      document.body.append(container);
      const { send, answer } = sender();
      setMiniAppSignIn(send);
      void signInToMiniApp();
      await act(async () => answer("failed"));

      const root = await act(async () => hydrateRoot(container, createElement(Screen)));
      expect(container.textContent).toBe("failed");
      expect(send).toHaveBeenCalledOnce();
      act(() => root.unmount());
      container.remove();
    });

    it("keeps an answer no new request can change", () => {
      const { result } = renderHook(() => useMiniAppSignInNow());
      act(() => setMiniAppSignIn(null));
      expect(result.current).toBe("reopen");
    });
  });
});
