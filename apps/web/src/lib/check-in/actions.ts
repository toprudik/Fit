"use server";

import { refresh } from "next/cache";
import QRCode from "qrcode";
import { serverEnv } from "@/env/server";
import { personName } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkInTelegram, isCheckInCode, isPlaceCheckInToken, isSessionId, placeCheckInTelegram, sessionMarks } from "./link";

export type CheckInOutcome = "checked_in" | "already" | "requested" | "too_early" | "closed" | "expired" | "no_booking";

export type CheckInResult =
  | { status: "done"; outcome: CheckInOutcome; bookingId: string | null; opensAt: string | null }
  | { status: "error" };

const OUTCOMES: CheckInOutcome[] = ["checked_in", "already", "requested", "too_early", "closed", "expired", "no_booking"];

/**
 * The client's check-in by the trainer's QR (PRD wave-3 §5). The database checks the code, the window and the
 * booking, marks the booking attended and charges it; a second scan changes nothing.
 */
export async function checkIn(sessionId: string, code: string): Promise<CheckInResult> {
  if (!isSessionId(sessionId) || !isCheckInCode(code)) {
    return { status: "done", outcome: "expired", bookingId: null, opensAt: null };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in_by_qr", { p_session_id: sessionId, p_code: code });
  const row = data?.[0];
  const outcome = OUTCOMES.find((known) => known === row?.outcome);
  if (error || !row || !outcome) {
    if (error) console.error("checking in failed", error.code);
    return { status: "error" };
  }
  if (outcome === "checked_in" || outcome === "requested") refresh();
  return { status: "done", outcome, bookingId: row.booking_id, opensAt: row.opens_at };
}

/** The client's check-in by the printed QR of a location (§5 rule 2b): their nearest booking there. */
export async function checkInByPlace(token: string): Promise<CheckInResult> {
  if (!isPlaceCheckInToken(token)) return { status: "done", outcome: "expired", bookingId: null, opensAt: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in_by_location", { p_token: token });
  const row = data?.[0];
  const outcome = OUTCOMES.find((known) => known === row?.outcome);
  if (error || !row || !outcome) {
    if (error) console.error("checking in by a location failed", error.code);
    return { status: "error" };
  }
  if (outcome === "checked_in") refresh();
  return { status: "done", outcome, bookingId: row.booking_id, opensAt: row.opens_at };
}

/** The printed QR of a trainer's location as an SVG; `renew` issues a new code and the old print stops working. */
export async function loadPlaceQr(locationId: string, renew = false): Promise<{ status: "done"; qrSvg: string } | { status: "error" }> {
  if (!isSessionId(locationId)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("location_check_in_token", { p_location_id: locationId, p_renew: renew });
  if (error || !data) {
    if (error) console.error("loading a location QR failed", error.code);
    return { status: "error" };
  }
  return { status: "done", qrSvg: await qrSvg(placeCheckInTelegram(data, serverEnv().TELEGRAM_BOT_USERNAME)) };
}

/** Dark modules on white whatever the theme: that is what scanners read best. */
function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}

export type CheckInQr =
  | {
      status: "open";
      /** Null until check-in opens, 30 minutes before the start. */
      qrSvg: string | null;
      refreshAt: string;
      opensAt: string;
      checkedIn: { bookingId: string; name: string }[];
    }
  | { status: "closed" }
  | { status: "error" };

/** The trainer's QR of a session (§5 rule 2a): the current code as an SVG and who has checked in. */
export async function loadCheckInQr(sessionId: string): Promise<CheckInQr> {
  if (!isSessionId(sessionId)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("session_check_in_qr", { p_session_id: sessionId });
  if (error?.message === "check_in_closed") return { status: "closed" };
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error("loading the check-in QR failed", error.code);
    return { status: "error" };
  }
  const link = row.code ? checkInTelegram(sessionId, row.code, serverEnv().TELEGRAM_BOT_USERNAME) : null;
  const svg = link ? await qrSvg(link) : null;
  const checkedIn = Array.isArray(row.checked_in)
    ? row.checked_in.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.booking_id !== "string") return [];
        const first = typeof entry.first_name === "string" ? entry.first_name : null;
        const last = typeof entry.last_name === "string" ? entry.last_name : null;
        return [{ bookingId: entry.booking_id, name: personName(first, last) }];
      })
    : [];
  return { status: "open", qrSvg: svg, refreshAt: row.refresh_at, opensAt: row.opens_at, checkedIn };
}

/**
 * The attendance of a session as sessionMarks builds it (§5 crit. 5.1): the trainer's session page compares it with
 * the one it was rendered with and re-renders when a client checked in, with or without the QR sheet open. Null when
 * the session cannot be read.
 */
export async function loadSessionMarks(sessionId: string): Promise<string | null> {
  if (!isSessionId(sessionId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("bookings").select("id, status").eq("session_id", sessionId).order("created_at");
  if (error) {
    console.error("loading the session marks failed", error.code);
    return null;
  }
  return sessionMarks(data.map((row) => ({ bookingId: row.id, status: row.status })));
}
