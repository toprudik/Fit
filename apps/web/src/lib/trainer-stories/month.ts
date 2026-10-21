/** The finished month before the one running in the given zone, as "2026-09" (marketing backlog 5). */
export function previousMonth(timeZone: string, now: Date = new Date()): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone }).format(now).split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
