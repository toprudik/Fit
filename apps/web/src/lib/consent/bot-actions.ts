"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Records whether the bot may write to the signed-in user (PRD wave-1 §2.1 rule 6, AUTH-7): Telegram's
 * answer to requestWriteAccess in the Mini App, or "Проверить" on the website after the user started the
 * bot. With `sendTest` an allowed answer also queues the test message. Returns whether it was saved.
 */
export async function setBotMessages(allowed: boolean, sendTest = false): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_bot_messages", { p_allowed: allowed, p_send_test: sendTest });
  if (error) {
    console.error("saving bot message access failed", error.code);
    return false;
  }
  // The root layout reads the mark for the profile banner.
  revalidatePath("/", "layout");
  return true;
}
