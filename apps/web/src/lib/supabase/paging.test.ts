import { describe, expect, it } from "vitest";
import { ID_CHUNK, PAGE_SIZE, readAllPages, readByIds } from "./paging";

const table = Array.from({ length: 2345 }, (_, index) => index);

describe("readAllPages", () => {
  it("reads past the 1000-row cap until a short page", async () => {
    const asked: [number, number][] = [];
    const result = await readAllPages((from, to) => {
      asked.push([from, to]);
      return Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null });
    });
    expect(result.data).toEqual(table);
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks one more page when the last one is exactly full", async () => {
    let calls = 0;
    const result = await readAllPages((from) => {
      calls += 1;
      return Promise.resolve({ data: table.slice(0, 2000).slice(from, from + PAGE_SIZE), error: null });
    });
    expect(result.data).toHaveLength(2000);
    expect(calls).toBe(3);
  });

  it("returns the error instead of a partial result", async () => {
    const result = await readAllPages((from) =>
      Promise.resolve(from === 0 ? { data: table.slice(0, PAGE_SIZE), error: null } : { data: null, error: { code: "57014" } }),
    );
    expect(result).toEqual({ data: null, error: { code: "57014" } });
  });
});

describe("readByIds", () => {
  it("splits long id lists and asks each id once", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const chunks: number[] = [];
    const result = await readByIds([...ids, ...ids.slice(0, 10)], (chunk) => {
      chunks.push(chunk.length);
      return Promise.resolve({ data: chunk, error: null });
    });
    expect(chunks).toEqual([ID_CHUNK, ID_CHUNK, 50]);
    expect(result.data).toEqual(ids);
  });

  it("does not ask at all for no ids", async () => {
    let calls = 0;
    const result = await readByIds([], () => {
      calls += 1;
      return Promise.resolve({ data: [], error: null });
    });
    expect(result).toEqual({ data: [], error: null });
    expect(calls).toBe(0);
  });
});
