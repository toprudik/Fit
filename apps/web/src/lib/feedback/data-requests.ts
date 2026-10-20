/**
 * Deadlines of "Запрос о моих данных" (152-FZ arts. 20, 21): the database sets due_on, 10 working days after the
 * request came, once extendable by 5 (migration 20261020103117_data_requests.sql), counting days in Moscow time.
 * The inbox counts down in the admin's own time zone, so "today" and "overdue" match the day they see.
 */
export const DATA_REQUEST_TIME_ZONE = "Europe/Moscow";
export const MAX_EXTENSION_REASON = 1000;

export type DueState = "overdue" | "today" | "open";

/** Today in the given time zone as YYYY-MM-DD, the format of due_on. */
export function requestToday(timeZone: string = DATA_REQUEST_TIME_ZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Where an open request stands against its deadline. */
export function dueState(dueOn: string, today: string): DueState {
  if (dueOn < today) return "overdue";
  return dueOn === today ? "today" : "open";
}

export const DUE_TONE = { overdue: "danger", today: "warning", open: "neutral" } as const;
