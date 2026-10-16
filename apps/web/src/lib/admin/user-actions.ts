"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const input = z.object({ userId: z.uuid(), reason: z.string().trim().min(1).max(500) });

/** A Supabase ban lasts this long: a hundred years, until an admin lifts it. */
const BAN_DURATION = "876000h";

export type BlockResult = { status: "done" | "reason-required" | "already" | "admin" | "self" | "failed" };

/**
 * The account's Supabase user follows the block: a banned user's refresh token stops working, so a session
 * that already exists ends within the hour its access token lives. Sign-in checks blocked_at on its own, so a
 * failure here leaves the block in force and is only logged.
 */
async function setBan(userId: string, banned: boolean) {
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_DURATION : "none",
  });
  if (error) console.error(banned ? "banning the auth user failed" : "lifting the auth ban failed", error.code ?? error.status);
}

/**
 * "Заблокировать" on the user card (ADM-7). admin_block_user checks that the caller is an admin, refuses admins
 * and the caller, and writes the audit log; only then does the secret key ban the auth user.
 */
export async function blockUser(raw: { userId: string; reason: string }): Promise<BlockResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: raw.reason?.trim() ? "failed" : "reason-required" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_block_user", { p_user_id: parsed.data.userId, p_reason: parsed.data.reason });
  if (!error) {
    await setBan(parsed.data.userId, true);
    refresh();
    return { status: "done" };
  }
  switch (error.message) {
    case "already_blocked":
      refresh();
      return { status: "already" };
    case "reason_required":
      return { status: "reason-required" };
    case "cannot_block_admin":
      return { status: "admin" };
    case "cannot_block_self":
      return { status: "self" };
  }
  console.error("blocking a user failed", error.code);
  return { status: "failed" };
}

/** "Разблокировать": admin_unblock_user lifts the block and audits it, then the auth ban goes too. */
export async function unblockUser(raw: { userId: string; reason: string }): Promise<BlockResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: raw.reason?.trim() ? "failed" : "reason-required" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_unblock_user", { p_user_id: parsed.data.userId, p_reason: parsed.data.reason });
  if (!error) {
    await setBan(parsed.data.userId, false);
    refresh();
    return { status: "done" };
  }
  if (error.message === "not_blocked") {
    // Another admin lifted it first.
    refresh();
    return { status: "already" };
  }
  if (error.message === "reason_required") return { status: "reason-required" };
  console.error("unblocking a user failed", error.code);
  return { status: "failed" };
}
