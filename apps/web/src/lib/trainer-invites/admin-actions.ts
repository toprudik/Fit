"use server";

import { refresh } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inviteTelegramLink } from "./code";

export type CreateInviteState =
  | { status: "idle" }
  | { status: "invalid-days" }
  | { status: "failed" }
  /** The code exists only in this answer: the database keeps its hash. */
  | { status: "created"; code: string; link: string; qrSvg: string; expiresAt: string };

const createInput = z.object({
  note: z.string().trim().max(200),
  days: z.coerce.number().int().min(1).max(90),
});

/**
 * "Создать приглашение" in /admin/invites. The database checks that the caller is an admin and writes the
 * audit log (admin_create_trainer_invite); a non-admin gets "failed" and no invite.
 */
export async function createTrainerInvite(_previous: CreateInviteState, formData: FormData): Promise<CreateInviteState> {
  const parsed = createInput.safeParse({ note: formData.get("note") ?? "", days: formData.get("days") });
  if (!parsed.success) return { status: "invalid-days" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("admin_create_trainer_invite", { p_note: parsed.data.note, p_valid_days: parsed.data.days })
    .single();
  if (error || !data) {
    console.error("creating a trainer invite failed", error?.code);
    return { status: "failed" };
  }

  const link = inviteTelegramLink(data.code, serverEnv().TELEGRAM_BOT_USERNAME);
  // Dark modules on white whatever the theme: that is what scanners read best.
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  refresh();
  return { status: "created", code: data.code, link, qrSvg, expiresAt: data.expires_at };
}

/** "Отозвать" in /admin/invites; admin_revoke_trainer_invite checks the caller and audits it. */
export async function revokeTrainerInvite(inviteId: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(inviteId).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_trainer_invite", { p_invite_id: inviteId });
  if (error) {
    console.error("revoking a trainer invite failed", error.code);
    // Already redeemed or revoked elsewhere: the list shows what happened.
    if (error.message === "invite_not_revocable") refresh();
    return { ok: false };
  }
  refresh();
  return { ok: true };
}
