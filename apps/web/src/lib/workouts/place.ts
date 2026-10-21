import "server-only";

import { loadWorkoutPair, viewerId } from "./logs";
import { loadSubstituteParticipant } from "./substitute";

/**
 * Where the screens of one side live: the trainer's pair tab, the client's diary, or a participant of the
 * session a substitute runs (PRD wave-3 §1 "Подмена" rule 4: the log of that session only).
 */
export type LogPlace = { side: "trainer"; coachingId: string } | { side: "client" } | { side: "substitute"; sessionId: string; bookingId: string };

export type PlaceClient = {
  clientId: string;
  canWrite: boolean;
  /** A substitute's booking: the only session its logs may belong to, with the session's start. */
  booking?: { id: string; coachingId: string; startsAt: string };
};

/** Whose logs the place shows and whether the viewer may write one there; null when it is not theirs. */
export async function placeClient(place: LogPlace): Promise<PlaceClient | null> {
  if (place.side === "client") {
    const me = await viewerId();
    return me ? { clientId: me, canWrite: true } : null;
  }
  if (place.side === "substitute") {
    const participant = await loadSubstituteParticipant(place.sessionId, place.bookingId);
    if (!participant) return null;
    return {
      clientId: participant.clientId,
      canWrite: participant.live,
      booking: { id: participant.bookingId, coachingId: participant.coachingId, startsAt: participant.startsAt },
    };
  }
  const pair = await loadWorkoutPair(place.coachingId);
  if (!pair?.viewerIsTrainer) return null;
  return { clientId: pair.clientId, canWrite: pair.live };
}
