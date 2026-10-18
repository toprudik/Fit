/** What an owner can delegate to an assistant (PRD wave-3 §1): never passes or payments (rule 3). */
export const ASSISTANT_SCOPES = ["schedule", "attendance", "workouts", "homework", "notes", "progress", "nutrition"] as const;
export type AssistantScope = (typeof ASSISTANT_SCOPES)[number];

export function isAssistantScope(value: unknown): value is AssistantScope {
  return typeof value === "string" && (ASSISTANT_SCOPES as readonly string[]).includes(value);
}

/** How many sessions one substitute invite may cover (create_substitutions). */
export const SUBSTITUTE_MAX = 20;

/** The path a delegate opens to accept an invite; the token travels in the query, never in logs. */
export function invitePath(token: string): string {
  return `/trainer/team/accept?token=${encodeURIComponent(token)}`;
}

/** An invite token as create_delegation returns it: url-safe base64 of 18 bytes. */
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,40}$/.test(value);
}
