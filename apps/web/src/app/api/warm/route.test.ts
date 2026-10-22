import { expect, it, vi } from "vitest";

const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", () => ({ connection }));

const { GET } = await import("./route");

it("answers 204 without a body, uncached, after waiting for the request", async () => {
  const response = await GET();
  expect(connection).toHaveBeenCalledOnce();
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("");
});
