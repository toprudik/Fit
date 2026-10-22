import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";

/** What a remaining count needs: sessions left on the pass and how many of them future bookings already hold. */
export type RemainingCounts = { remaining: number; available: number };

/** Sessions held by confirmed future bookings: they are still on the pass and come off when the session takes place. */
export function bookedSessions(pass: RemainingCounts): number {
  return Math.max(0, pass.remaining - pass.available);
}

/**
 * One rule for the remaining count on every screen (QA B2): the sessions still on the pass, and next to them how many
 * future bookings already hold, e.g. "Осталось 10 из 10, забронировано: 1". The booking sheet says the same in its
 * own words ("после записи останется 9").
 */
export function passLeftText(
  t: Dictionary,
  pass: RemainingCounts & { sessionsTotal: number; status?: string },
): string {
  const copy = t.money.passes;
  if (pass.status === "expired" && pass.remaining > 0) return interpolate(copy.leftExpired, { remaining: pass.remaining });
  return withBooked(t, interpolate(copy.left, { remaining: pass.remaining, total: pass.sessionsTotal }), pass);
}

/** Adds "забронировано: N" to a remaining line when future bookings hold some of the sessions. */
export function withBooked(t: Dictionary, line: string, pass: RemainingCounts): string {
  const booked = bookedSessions(pass);
  return booked > 0 ? `${line}, ${interpolate(t.money.passes.booked, { count: booked })}` : line;
}
