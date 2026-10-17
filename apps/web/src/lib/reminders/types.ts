/** Types the user can switch off on /settings/notifications (PRD 2.9-8); the rest of wave 1 is mandatory or not sent yet. */
export const CLIENT_TOGGLES = ["session_reminder", "coaching_ended", "homework_reminder", "badge", "challenge", "monthly_report", "pass_ending", "debt"] as const;
export const TRAINER_TOGGLES = ["daily_digest", "coaching_created", "homework_done", "client_pass_ending"] as const;
export type ToggleType = (typeof CLIENT_TOGGLES)[number] | (typeof TRAINER_TOGGLES)[number];

/** Types that are off until the user turns them on (a row with enabled = true): "Клиент выполнил задание" (PRD 10-5). */
export const OFF_BY_DEFAULT: readonly ToggleType[] = ["homework_done"];

export function isToggleType(value: unknown): value is ToggleType {
  return (CLIENT_TOGGLES as readonly unknown[]).includes(value) || (TRAINER_TOGGLES as readonly unknown[]).includes(value);
}

/** "22:00" from "22:00:00", or null when the value is not a time of day. */
export function shortTime(value: string | null | undefined): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(value ?? "");
  return match ? `${match[1]}:${match[2]}` : null;
}
