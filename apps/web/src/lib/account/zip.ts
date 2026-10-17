import { crc32, deflateRawSync } from "node:zlib";

/**
 * A minimal ZIP writer for the data export (PRD wave-1 §2.12-6): text files are deflated, photos are stored as
 * they are, since WebP and JPEG do not shrink further. Plain ZIP without ZIP64, so one archive stays well under
 * 4 GB; the export splits into parts long before that (PART_LIMIT in export.ts). Every archive opens with the
 * tools built into Windows, macOS, iOS and Android.
 */

export type ZipEntry = { name: string; data: Uint8Array };

/** Extensions that are already compressed: storing them saves the time deflate would waste. */
const STORED = /\.(webp|jpe?g|png|zip)$/i;

/** MS-DOS date and time, as ZIP headers keep them, in UTC. */
function dosTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

/** Builds one archive of the entries, in order. Names use "/" for folders and are written as UTF-8. */
export function zip(entries: ZipEntry[], at: Date = new Date()): Uint8Array {
  const { time, day } = dosTime(at);
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const store = STORED.test(entry.name);
    const body = store ? entry.data : new Uint8Array(deflateRawSync(entry.data));
    const checksum = crc32(entry.data) >>> 0;
    const method = store ? 0 : 8;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed: 2.0
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, body);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // made by: 2.0
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, method, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + body.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}
