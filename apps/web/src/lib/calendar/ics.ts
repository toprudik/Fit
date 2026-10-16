import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";

/** One event of public.calendar_feed. */
export type FeedEvent = {
  uid: string;
  starts_at: string;
  ends_at: string;
  updated_at?: string | null;
  cancelled: boolean;
  kind: "personal" | "group" | "trial";
  title: string | null;
  mode: "offline" | "online";
  location_name: string | null;
  location_address: string | null;
  meeting_url: string | null;
  partner: string | null;
};

export type Feed = { zone: "trainer" | "client"; events: FeedEvent[] };

/** RFC 5545 text: backslash, semicolon, comma and line breaks are escaped. */
export function escapeText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC date-time, "20261015T153000Z": the calendar shows it in the viewer's own zone (CAL-1). */
export function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The event name: what kind of session and with whom (PRD 2.7-2). */
export function eventSummary(event: FeedEvent, zone: Feed["zone"], copy: Dictionary["calendar"]["ics"]): string {
  const name = event.partner?.trim() || "";
  const title = event.title?.trim() || "";
  if (zone === "trainer") {
    if (event.kind === "group") return title || copy.group;
    const template = event.kind === "trial" ? copy.trialTrainer : copy.personalTrainer;
    return name ? interpolate(template, { name }) : event.kind === "trial" ? copy.trial : copy.personal;
  }
  if (event.kind === "group") return name ? interpolate(copy.groupClient, { title: title || copy.group, name }) : title || copy.group;
  const template = event.kind === "trial" ? copy.trialClient : copy.personalClient;
  return name ? interpolate(template, { name }) : event.kind === "trial" ? copy.trial : copy.personal;
}

/**
 * The ICS document of a feed (PRD 2.7): name, time, place or meeting link, a link back to DaFit; cancelled
 * events stay with STATUS:CANCELLED. Nothing else about the people goes in (CAL-4).
 */
export function buildCalendar(feed: Feed, options: { copy: Dictionary["calendar"]["ics"]; appUrl: string; now: Date }): string {
  const { copy, appUrl } = options;
  const link = new URL(feed.zone === "trainer" ? "/trainer/schedule" : "/client/sessions", appUrl).toString();
  const stamp = icsDate(options.now.toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DaFit//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(feed.zone === "trainer" ? copy.calendarTrainer : copy.calendarClient)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const event of feed.events) {
    const place = event.mode === "online" ? copy.online : [event.location_name, event.location_address].filter(Boolean).join(", ");
    const description = [
      event.meeting_url ? interpolate(copy.meeting, { url: event.meeting_url }) : null,
      interpolate(copy.openInApp, { url: link }),
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@dafit`,
      `DTSTAMP:${event.updated_at ? icsDate(event.updated_at) : stamp}`,
      `DTSTART:${icsDate(event.starts_at)}`,
      `DTEND:${icsDate(event.ends_at)}`,
      `SUMMARY:${escapeText(eventSummary(event, feed.zone, copy))}`,
      ...(place ? [`LOCATION:${escapeText(place)}`] : []),
      `DESCRIPTION:${escapeText(description.join("\n"))}`,
      `URL:${link}`,
      `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
