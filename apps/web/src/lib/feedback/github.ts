import "server-only";
import { serverEnv } from "@/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { feedbackIssue } from "./issue";

export type FileIssueResult = "filed" | "exists" | "disabled" | "failed";

/**
 * Files the GitHub issue of one feedback message and stores its link (PRD FDBK-1, R49). Server code without a
 * user: it reads the row and writes github_issue_url with the secret key, since the author may not change that
 * column and the issue must exist even when nobody from the team is online. Does nothing without
 * GITHUB_FEEDBACK_TOKEN or when the message already has an issue.
 */
export async function fileFeedbackIssue(feedbackId: string): Promise<FileIssueResult> {
  const env = serverEnv();
  if (!env.GITHUB_FEEDBACK_TOKEN) return "disabled";
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("feedback")
    .select("id, kind, body, zone, route, platform, app_version, locale, theme, attachment_paths, github_issue_url")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error || !row) {
    console.error("feedback issue: reading the message failed", error?.code);
    return "failed";
  }
  if (row.github_issue_url) return "exists";

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_FEEDBACK_REPO}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_FEEDBACK_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(feedbackIssue(row)),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) {
    console.error("feedback issue: GitHub answered", response?.status ?? "no response");
    return "failed";
  }
  const issue = (await response.json().catch(() => null)) as { html_url?: unknown } | null;
  const url = typeof issue?.html_url === "string" && issue.html_url.startsWith("https://github.com/") ? issue.html_url : null;
  if (!url) return "failed";
  const saved = await admin.from("feedback").update({ github_issue_url: url }).eq("id", row.id).is("github_issue_url", null);
  if (saved.error) console.error("feedback issue: saving the link failed", saved.error.code);
  return "filed";
}
