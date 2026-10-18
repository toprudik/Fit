import "server-only";
import { loadDelegatedSession } from "@/lib/delegations/load";
import { isPairId } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkoutPair } from "./logs";

/** One participant of a session the signed-in trainer substitutes on (PRD wave-3 §1 "Подмена", rule 4). */
export type SubstituteParticipant = {
  sessionId: string;
  bookingId: string;
  coachingId: string;
  clientId: string;
  name: string;
  startsAt: string;
  timeZone: string;
  /** The pair is live, so a log can still be written. */
  live: boolean;
  /** Logs of this booking, newest first: the substitute logs the session it runs, nothing else. */
  logs: { id: string; title: string | null; performedAt: string }[];
};

/**
 * The participant behind a booking of the caller's substitute session, or null when the caller does not
 * substitute there (any more: access ends with the session) or the booking is not on it.
 */
export async function loadSubstituteParticipant(sessionId: string, bookingId: string): Promise<SubstituteParticipant | null> {
  if (!isPairId(sessionId) || !isPairId(bookingId)) return null;
  const session = await loadDelegatedSession(sessionId);
  const participant = session?.participants.find((person) => person.bookingId === bookingId);
  if (!session || !participant) return null;
  const pair = await loadWorkoutPair(participant.coachingId);
  if (!pair) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, title, performed_at")
    .eq("booking_id", bookingId)
    .order("performed_at", { ascending: false });
  if (error) throw new Error(`loading the session logs failed: ${error.code}`);
  return {
    sessionId: session.id,
    bookingId,
    coachingId: participant.coachingId,
    clientId: pair.clientId,
    name: participant.name,
    startsAt: session.startsAt,
    timeZone: session.timeZone,
    live: pair.live,
    logs: data.map((log) => ({ id: log.id, title: log.title, performedAt: log.performed_at })),
  };
}

export const substitutePath = (sessionId: string, bookingId: string) => `/trainer/team/sessions/${sessionId}/bookings/${bookingId}`;
