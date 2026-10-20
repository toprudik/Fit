"use server";

import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENT_PATH, PREFERENCES_PATH } from "./beta-terms";
import { loadConsentDocument } from "./documents";
import { onboardingNext, withNext } from "./next";
import {
  CONSENT_KINDS,
  type ConsentKind,
  type ConsentRow,
  HEALTH_CONSENT,
  hasHealthConsent,
  missingTermsConsents,
  pendingStep,
  PERSONAL_CONSENT,
} from "./required";

export type AcceptState = { failed: false | "save" | "age" };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The language the screen showed the text in. The form sends it: getLocale() throws inside a Server Action. */
function formLocale(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The signed-in user, or the login screen that comes back to the consents with `next`. */
async function signedIn(
  next: string,
): Promise<{ supabase: Supabase; userId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) redirect(withNext("/login", withNext(CONSENT_PATH, next)));
  return { supabase, userId };
}

/** The user's consents in force (not revoked), or null when they could not be read. */
async function readConsents(
  supabase: Supabase,
  userId: string,
): Promise<ConsentRow[] | null> {
  const { data, error } = await supabase
    .from("consents")
    .select("kind, version")
    .eq("user_id", userId)
    .in("kind", CONSENT_KINDS)
    .is("revoked_at", null);
  if (error) {
    console.error("reading consents failed", error.code);
    return null;
  }
  return data;
}

/**
 * Records one consent with the hash of the text shown (RLS lets a user insert their own rows only). 23505: this
 * version is recorded already (a second tap, another tab), which is the state we want.
 */
async function record(
  supabase: Supabase,
  userId: string,
  consent: { kind: ConsentKind; version: string },
  locale: Locale,
): Promise<boolean> {
  const document = await loadConsentDocument(locale, consent.kind);
  const { error } = await supabase
    .from("consents")
    .insert({
      user_id: userId,
      kind: consent.kind,
      version: consent.version,
      text_hash: document?.hash ?? null,
    });
  if (error && error.code !== "23505") {
    console.error(`saving the ${consent.kind} consent failed`, error.code);
    return false;
  }
  return true;
}

/** The consents screen again, at a given step, keeping `next` and whether this is the first onboarding. */
function stepPath(next: string, step: "health" | null, first: boolean): string {
  const query = new URLSearchParams({ next });
  if (step) query.set("step", step);
  if (first) query.set("first", "1");
  return `${CONSENT_PATH}?${query}`;
}

/** Once the required consents are in: the language step (first time) or `next`. */
function finish(next: string, first: boolean): never {
  redirect(first ? withNext(PREFERENCES_PATH, next) : next);
}

/**
 * "Принимаю" on the terms screen (PRD wave-1 §2.1 rule 3, AUTH-4; legal А1, А2): the beta terms, the user
 * agreement and the privacy policy, and "Мне есть 18 лет", which has to be ticked. Then the personal data step.
 */
export async function acceptTerms(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  if (formData.get("adult") !== "on") return { failed: "age" };
  const { supabase, userId } = await signedIn(next);

  const rows = await readConsents(supabase, userId);
  if (!rows) return { failed: "save" };
  // Nobody accepted anything yet: after the consents comes the language, theme and bot messages step.
  const first = !rows.some((row) => row.kind === "beta_terms");
  const saved = await Promise.all(
    missingTermsConsents(rows).map((consent) =>
      record(supabase, userId, consent, formLocale(formData)),
    ),
  );
  if (saved.includes(false)) return { failed: "save" };
  redirect(stepPath(next, null, first));
}

/** "Даю согласие" on the personal data screen (legal А2, 152-FZ art. 9). Then the health data step. */
export async function acceptPersonalData(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  const first = formData.get("first") === "1";
  const { supabase, userId } = await signedIn(next);
  if (!(await record(supabase, userId, PERSONAL_CONSENT, formLocale(formData))))
    return { failed: "save" };

  const rows = await readConsents(supabase, userId);
  if (!rows) return { failed: "save" };
  // Anything still missing goes back to its screen; health data is asked once the required ones are in.
  if (pendingStep(rows) !== null) redirect(stepPath(next, null, first));
  if (!hasHealthConsent(rows)) redirect(stepPath(next, "health", first));
  return finish(next, first);
}

/**
 * "Даю согласие" or "Не сейчас" on the health data screen (legal А2, 152-FZ art. 10). The app works without it;
 * the health sections ask again when opened (право 3).
 */
export async function answerHealthData(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  const first = formData.get("first") === "1";
  const { supabase, userId } = await signedIn(next);
  if (
    formData.get("answer") === "give" &&
    !(await record(supabase, userId, HEALTH_CONSENT, formLocale(formData)))
  )
    return { failed: "save" };

  const rows = await readConsents(supabase, userId);
  if (!rows) return { failed: "save" };
  if (pendingStep(rows) !== null) redirect(stepPath(next, null, first));
  return finish(next, first);
}

/**
 * "Мне нет 18 лет" → "Удалить аккаунт" (legal А1): DaFit is for adults, so the account goes the usual way, deleted
 * after 30 days (PRIV-7). A new token carries the deletion mark to the proxy right away.
 */
export async function closeUnderageAccount(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  const { supabase } = await signedIn(next);
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) {
    console.error("request_account_deletion failed", error.code);
    return { failed: "save" };
  }
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError)
    console.error(
      "refreshing the session failed",
      refreshError.status ?? "unknown",
    );
  redirect(
    `${CONSENT_PATH}?${new URLSearchParams({ next, step: "underage" })}`,
  );
}

/** "Я ошибся с возрастом" on the underage screen: the account stays, and the terms screen comes back. */
export async function keepUnderageAccount(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  const { supabase } = await signedIn(next);
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) {
    console.error("cancel_account_deletion failed", error.code);
    return { failed: "save" };
  }
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError)
    console.error(
      "refreshing the session failed",
      refreshError.status ?? "unknown",
    );
  redirect(stepPath(next, null, false));
}
