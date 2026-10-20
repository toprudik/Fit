/**
 * Deadlines of "Запрос о моих данных" (152-FZ arts. 20, 21): the database sets due_on, 10 working days after the
 * request came, once extendable by 5 (migration 20261020103117_data_requests.sql). Days are the operator's,
 * in Moscow time.
 */
export const DATA_REQUEST_TIME_ZONE = "Europe/Moscow";
export const MAX_EXTENSION_REASON = 1000;

export type DueState = "overdue" | "today" | "open";

/** Today in Moscow as YYYY-MM-DD, the format of due_on. */
export function requestToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DATA_REQUEST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Where an open request stands against its deadline. */
export function dueState(dueOn: string, today: string): DueState {
  if (dueOn < today) return "overdue";
  return dueOn === today ? "today" : "open";
}

export const DUE_TONE = { overdue: "danger", today: "warning", open: "neutral" } as const;
