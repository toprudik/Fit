import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zip } from "./zip";

const text = (value: string) => new TextEncoder().encode(value);

/** Reads the archive back by its central directory: name, method and the inflated or stored bytes. */
function unzip(archive: Uint8Array): { name: string; method: number; data: Buffer }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(local + 26, true);
    const body = Buffer.from(archive.subarray(local + 30 + localName, local + 30 + localName + size));
    out.push({ name, method, data: method === 8 ? inflateRawSync(body) : body });
    at += 46 + nameLength;
  }
  return out;
}

describe("zip", () => {
  it("deflates text and stores photos, with UTF-8 names", () => {
    const photo = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
    const archive = zip([
      { name: "data/замеры.json", data: text('[{"kind":"weight"}]'.repeat(50)) },
      { name: "photos/2026-10-01-front.webp", data: photo },
    ]);
    const entries = unzip(archive);
    expect(entries.map((entry) => [entry.name, entry.method])).toEqual([
      ["data/замеры.json", 8],
      ["photos/2026-10-01-front.webp", 0],
    ]);
    expect(entries[0].data.toString()).toBe('[{"kind":"weight"}]'.repeat(50));
    expect([...entries[1].data]).toEqual([...photo]);
  });

  it("makes an archive the system unzip accepts", () => {
    let unzipAvailable = true;
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
    } catch {
      unzipAvailable = false;
    }
    if (!unzipAvailable) return;
    const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
    try {
      writeFileSync(join(dir, "a.zip"), zip([{ name: "csv/a.csv", data: text("id,value\n1,2\n") }]));
      execFileSync("unzip", ["-tq", join(dir, "a.zip")]);
      execFileSync("unzip", ["-q", join(dir, "a.zip"), "-d", join(dir, "out")]);
      expect(readFileSync(join(dir, "out", "csv", "a.csv"), "utf8")).toBe("id,value\n1,2\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes an empty archive", () => {
    expect(unzip(zip([]))).toEqual([]);
  });
});
