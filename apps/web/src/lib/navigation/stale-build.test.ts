// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForNewBuild } from "./stale-build";

const reload = vi.fn();

afterEach(() => {
  window.sessionStorage.clear();
  reload.mockClear();
});

describe("isChunkLoadError", () => {
  it("knows a chunk that failed to load in Turbopack and webpack, and nothing else", () => {
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/2yicp_iioqqky.js from module 123"))).toBe(true);
    const webpack = new Error("Loading chunk 42 failed.\n(error: /_next/static/chunks/42.js)");
    webpack.name = "ChunkLoadError";
    expect(isChunkLoadError(webpack)).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Failed to load chunk")).toBe(false);
  });
});

describe("reloadForNewBuild", () => {
  it("reloads once, and not again right after", () => {
    vi.stubGlobal("location", { ...window.location, reload });
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reloadForNewBuild(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    // Long after, the next deployment may need it again.
    expect(reloadForNewBuild(1_100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
