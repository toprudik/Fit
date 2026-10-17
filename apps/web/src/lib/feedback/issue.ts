import type { Database } from "@/lib/supabase/database.types";

type FeedbackRow = Pick<
  Database["public"]["Tables"]["feedback"]["Row"],
  "id" | "kind" | "body" | "zone" | "route" | "platform" | "app_version" | "locale" | "theme" | "attachment_paths"
>;

const KIND_TITLE = { bug: "Bug", idea: "Idea", other: "Feedback" } as const;

/**
 * The GitHub issue for one feedback message (PRD wave-1 §2.13-4, FDBK-2): the text and the context the form
 * recorded, and only the message's internal id. No name, username, Telegram id or user id; screenshots stay in
 * private Storage and the issue only counts them.
 */
export function feedbackIssue(row: FeedbackRow): { title: string; body: string; labels: string[] } {
  const firstLine = row.body.trim().split("\n")[0].replace(/\s+/g, " ");
  const summary = firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
  const context = [
    ["Feedback id", row.id],
    ["Zone", row.zone],
    ["Screen", row.route],
    ["Platform", row.platform],
    ["App version", row.app_version],
    ["Language", row.locale],
    ["Theme", row.theme],
    ["Screenshots", row.attachment_paths.length ? `${row.attachment_paths.length} (in /admin/feedback)` : null],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `| ${label} | ${String(value).replace(/\|/g, "\\|")} |`);
  const quoted = row.body
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return {
    title: `${KIND_TITLE[row.kind]}: ${summary}`,
    body: [quoted, "", "| | |", "|---|---|", ...context, "", "_Sent with the feedback button in the app._"].join("\n"),
    labels: ["needs-triage"],
  };
}
