"use server";

import { after } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fileFeedbackIssue } from "./github";
import { MAX_SCREENSHOTS, screenshotPath, screenshotProblem, type FeedbackInput, type ScreenshotType } from "./input";
import { feedbackInput } from "./schema";

const prepareInput = z.array(z.object({ type: z.string(), size: z.number().int() })).max(MAX_SCREENSHOTS);

export type PrepareFeedbackResult =
  | { status: "ready"; id: string; uploads: { path: string; token: string }[] }
  | { status: "invalid" | "signed-out" | "failed" };

/**
 * Step 1 of "Отправить": the message id and a one-time upload URL per screenshot in the author's own folder
 * (<user>/<id>/<n>.<ext>). Files go from the browser straight to Storage; the bucket checks type and size again.
 */
export async function prepareFeedback(screenshots: { type: string; size: number }[]): Promise<PrepareFeedbackResult> {
  const parsed = prepareInput.safeParse(screenshots);
  if (!parsed.success || parsed.data.some((file) => screenshotProblem(file))) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "signed-out" };

  const id = crypto.randomUUID();
  const uploads: { path: string; token: string }[] = [];
  for (const [index, file] of parsed.data.entries()) {
    const path = screenshotPath(userId, id, index + 1, file.type as ScreenshotType);
    const { data, error } = await supabase.storage.from("feedback").createSignedUploadUrl(path);
    if (error || !data) {
      console.error("preparing a feedback screenshot upload failed", error?.name);
      return { status: "failed" };
    }
    uploads.push({ path, token: data.token });
  }
  return { status: "ready", id, uploads };
}

export type SendFeedbackResult = { status: "sent" | "invalid" | "signed-out" | "failed" };

/**
 * Step 2: the message itself (PRD wave-1 §2.13). The row's insert queues the team message (А2); the GitHub issue
 * is filed after the response, so the author never waits on GitHub. Screenshots must be the ones step 1 named.
 */
export async function sendFeedback(input: FeedbackInput): Promise<SendFeedbackResult> {
  const parsed = feedbackInput.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const data = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "signed-out" };
  const ownPath = new RegExp(`^${userId}/${data.id}/[1-${MAX_SCREENSHOTS}]\\.(png|jpg|webp)$`);
  if (!data.screenshots.every((path) => ownPath.test(path))) return { status: "invalid" };

  const { error } = await supabase.from("feedback").insert({
    id: data.id,
    user_id: userId,
    kind: data.kind,
    body: data.body,
    route: data.route,
    zone: data.zone,
    platform: data.platform,
    app_version: serverEnv().VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    locale: data.locale,
    theme: data.theme,
    attachment_paths: data.screenshots,
  });
  if (error) {
    console.error("saving feedback failed", error.code);
    return { status: "failed" };
  }
  after(() => fileFeedbackIssue(data.id));
  return { status: "sent" };
}
