"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { paymentLinkInput } from "./input";

export type PaymentLinkValues = Record<string, string>;

export type PaymentLinkFormState =
  | { status: "idle" }
  | { status: "added" }
  | { status: "invalid"; fields: string[]; values: PaymentLinkValues }
  | { status: "failed"; values: PaymentLinkValues };

/** "Добавить ссылку" on /trainer/money/packages. RLS keeps the row to the signed-in trainer. */
export async function addPaymentLink(_previous: PaymentLinkFormState, form: FormData): Promise<PaymentLinkFormState> {
  const values = Object.fromEntries(["title", "url", "kind"].map((name) => [name, String(form.get(name) ?? "")]));
  const parsed = paymentLinkInput.safeParse(values);
  if (!parsed.success) {
    return { status: "invalid", fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))], values };
  }
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "failed", values };
  const { error } = await supabase.from("payment_links").insert({ trainer_id: userId, ...parsed.data });
  if (error) {
    console.error("adding a payment link failed", error.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "added" };
}

/** "Убрать": archived, so clients stop seeing it; there is no delete. */
export async function archivePaymentLink(id: string): Promise<{ failed: boolean }> {
  if (!z.uuid().safeParse(id).success) return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_links")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error || data.length !== 1) {
    console.error("archiving a payment link failed", error?.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
