// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountStoreForTests, setAccount, useAccount, type Account } from "./account-store";
import { AccountSync } from "./account-sync";

const ANNA: Account = { status: "signed-in", name: "Анна Смирнова", photoUrl: "https://t.me/i/userpic/320/anna.jpg", isTrainer: false, isAdmin: false };

beforeEach(() => {
  resetAccountStoreForTests();
});

afterEach(() => {
  cleanup();
  resetAccountStoreForTests();
});

describe("useAccount", () => {
  it("is loading until the server's answer arrives", () => {
    expect(renderHook(() => useAccount()).result.current).toEqual({ status: "loading" });
  });

  it("follows setAccount", () => {
    const { result } = renderHook(() => useAccount());

    act(() => setAccount(ANNA));
    expect(result.current).toEqual(ANNA);

    act(() => setAccount({ status: "signed-out" }));
    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("does not re-render when the same account arrives again", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useAccount();
    });
    act(() => setAccount(ANNA));
    const afterFirst = renders;

    act(() => setAccount({ ...ANNA }));
    expect(renders).toBe(afterFirst);

    act(() => setAccount({ ...ANNA, photoUrl: null }));
    expect(renders).toBe(afterFirst + 1);
  });
});

describe("AccountSync", () => {
  it("puts the signed-in person into the store", () => {
    const { result } = renderHook(() => useAccount());
    render(createElement(AccountSync, { account: { name: "Анна Смирнова", photoUrl: null, isTrainer: true, isAdmin: false } }));
    expect(result.current).toEqual({ status: "signed-in", name: "Анна Смирнова", photoUrl: null, isTrainer: true, isAdmin: false });
  });

  it("reports nobody signed in as signed out", () => {
    const { result } = renderHook(() => useAccount());
    render(createElement(AccountSync, { account: null }));
    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("picks up a new account after a refresh", () => {
    const { result } = renderHook(() => useAccount());
    const sync = render(createElement(AccountSync, { account: null }));

    sync.rerender(createElement(AccountSync, { account: { name: "Анна Смирнова", photoUrl: "https://t.me/i/userpic/320/anna.jpg", isTrainer: false, isAdmin: false } }));
    expect(result.current).toEqual(ANNA);
  });

  it("renders nothing", () => {
    const { container } = render(createElement(AccountSync, { account: null }));
    expect(container.innerHTML).toBe("");
  });
});

describe("server render and hydration", () => {
  function Probe() {
    return createElement("span", null, useAccount().status);
  }

  it("renders loading on the server, whatever the store holds", () => {
    setAccount(ANNA);
    expect(renderToString(createElement(Probe))).toBe("<span>loading</span>");
  });

  it("hydrates without a mismatch, then shows the account", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.append(container);
    setAccount(ANNA);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    const root = await act(async () => hydrateRoot(container, createElement(Probe), { onRecoverableError: recoverable }));

    expect(container.textContent).toBe("signed-in");
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
