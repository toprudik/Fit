"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isClientLinkToken, normalizeClientCode } from "./link";

export type JoinFailure = "invalid" | "unavailable" | "own" | "limit" | "failed";

export type JoinState = { status: "idle" } | { status: "joined"; coachingId: string } | { status: "error"; reason: JoinFailure };

/** What join_by_invite and join_by_code raise, as the screen words it. */
const FAILURES: Record<string, JoinFailure> = {
  invite_invalid: "invalid",
  trainer_unavailable: "unavailable",
  own_invite: "own",
  plan_limit_reached: "limit",
};

/**
 * "Стать клиентом" on /i/<token> and /join: joins the trainer as the signed-in user, by the link
 * token or the typed code (the database checks both and the Free limit). A pair that already exists
 * comes back as joined too. The screen shows the toast and opens the client zone.
 */
export async function joinTrainer(_previous: JoinState, formData: FormData): Promise<JoinState> {
  const token = formData.get("token");
  const code = normalizeClientCode(String(formData.get("code") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data, error } = isClientLinkToken(typeof token === "string" ? token : null)
    ? await supabase.rpc("join_by_invite", { p_token: token as string })
    : code
      ? await supabase.rpc("join_by_code", { p_code: code })
      : { data: null, error: { message: "invite_invalid", code: "P0001" } };
  if (error || !data) {
    const reason = (error && FAILURES[error.message]) ?? "failed";
    if (reason === "failed") console.error("joining a trainer failed", error?.code);
    return { status: "error", reason };
  }
  return { status: "joined", coachingId: data };
}

export type ReissueState = { failed: boolean };

/** "Перевыпустить ссылку" on /trainer/links: the old link, code and QR stop working at once. */
export async function reissueClientLink(): Promise<ReissueState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reissue_client_invite");
  if (error) {
    console.error("reissuing a client link failed", error.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
