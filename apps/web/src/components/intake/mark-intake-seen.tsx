"use client";

import { useEffect } from "react";
import { markIntakeSeen } from "@/lib/intake/actions";

/**
 * Marks the intake as read once the trainer actually has it on screen, not on a prefetch, so the next visit
 * marks only what changed after this one.
 */
export function MarkIntakeSeen({ coachingId, submittedAt }: { coachingId: string; submittedAt: string }) {
  useEffect(() => {
    void markIntakeSeen(coachingId);
  }, [coachingId, submittedAt]);
  return null;
}
