import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/config";
import { isZone, ZONE_COOKIE, ZONES } from "@/lib/navigation/zones";
import { preferenceCookieOptions, type Preferences } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { isThemePreference, THEME_COOKIE, THEME_PREFERENCES } from "@/lib/theme/theme";

type Supabase = SupabaseClient<Database>;

/** Body of PATCH /api/settings/preferences: at least one known preference, nothing else. */
export const preferencesPatch = z
  .strictObject({
    locale: z.enum(LOCALES),
    theme: z.enum(THEME_PREFERENCES),
    lastZone: z.enum(ZONES),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);

const COOKIE_NAMES: Record<keyof Preferences, string> = {
  locale: LOCALE_COOKIE,
  theme: THEME_COOKIE,
  lastZone: ZONE_COOKIE,
};

/** Raw preference cookies of the request; any of them may be missing or hold junk. */
export type DeviceCookies = {
  locale?: string | null;
  theme?: string | null;
  lastZone?: string | null;
};

/** Reads the preference cookies from a request's cookie jar. */
export function deviceCookies(get: (name: string) => string | null | undefined): DeviceCookies {
  return {
    locale: get(LOCALE_COOKIE),
    theme: get(THEME_COOKIE),
    lastZone: get(ZONE_COOKIE),
  };
}

/** Keys of `target` whose value differs from `current`. */
function changed(target: Preferences, current: Partial<Record<keyof Preferences, unknown>>): Partial<Preferences> {
  const out: Partial<Preferences> = {};
  for (const key of Object.keys(target) as (keyof Preferences)[]) {
    if (target[key] !== current[key]) Object.assign(out, { [key]: target[key] });
  }
  return out;
}

/**
 * Who wins at sign-in (ADR 0015). A brand-new account takes this device's choices, so what the
 * person picked before signing in stays; a language the device never saved comes from Telegram and
 * the browser (`firstLocale`). An existing account wins over the device, so a choice made on
 * another device follows the user here. The last zone is the exception: a device that has one keeps
 * it, because it is where the person was last on this device, and pages that the proxy serves
 * from a saved zone never write it again.
 */
export function reconcilePreferences(input: { account: Preferences; device: DeviceCookies; newAccount: boolean; firstLocale: Locale }): {
  save: Partial<Preferences>;
  cookies: Partial<Preferences>;
} {
  const { account, device } = input;
  const lastZone = isZone(device.lastZone) ? device.lastZone : account.lastZone;
  if (input.newAccount) {
    const chosen: Preferences = {
      locale: isLocale(device.locale) ? device.locale : input.firstLocale,
      theme: isThemePreference(device.theme) ? device.theme : account.theme,
      lastZone,
    };
    return { save: changed(chosen, account), cookies: changed(chosen, device) };
  }
  // Only cookies change here: the zone this device keeps is not news for the other devices.
  const chosen: Preferences = {
    locale: account.locale,
    theme: account.theme,
    lastZone,
  };
  return { save: {}, cookies: changed(chosen, device) };
}

/** Writes preferences to the user's user_settings row (RLS: the owner updates their own row). */
export async function saveAccountPreferencesRow(supabase: Supabase, userId: string, patch: Partial<Preferences>) {
  const row: Database["public"]["Tables"]["user_settings"]["Update"] = {};
  if (patch.locale) row.locale = patch.locale;
  if (patch.theme) row.theme = patch.theme;
  if (patch.lastZone) row.last_zone = patch.lastZone;
  if (Object.keys(row).length === 0) return { error: null };
  return supabase.from("user_settings").update(row).eq("user_id", userId);
}

async function readAccountPreferences(supabase: Supabase, userId: string): Promise<Preferences | null> {
  const { data, error } = await supabase.from("user_settings").select("locale, theme, last_zone").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return { locale: data.locale, theme: data.theme, lastZone: data.last_zone };
}

/**
 * Brings the device and the account in step after a sign-in check (reconcilePreferences) and
 * returns the cookies to set. Never fails the sign-in: when the account can't be read, the device
 * only gets a first language, as before user_settings existed.
 */
export async function syncPreferences(
  supabase: Supabase,
  input: {
    userId: string;
    device: DeviceCookies;
    newAccount: boolean;
    firstLocale: Locale;
  },
): Promise<Partial<Preferences>> {
  const fallback = isLocale(input.device.locale) ? {} : { locale: input.firstLocale };
  const account = await readAccountPreferences(supabase, input.userId).catch(() => null);
  if (!account) return fallback;
  const { save, cookies } = reconcilePreferences({ account, ...input });
  if (Object.keys(save).length > 0) {
    const { error } = await saveAccountPreferencesRow(supabase, input.userId, save);
    if (error) console.error("saving preferences failed", error.code);
  }
  return cookies;
}

/** Sets the given preference cookies on a response. */
export function setPreferenceCookies(response: NextResponse, preferences: Partial<Preferences>) {
  for (const [key, value] of Object.entries(preferences) as [keyof Preferences, string][]) {
    response.cookies.set(COOKIE_NAMES[key], value, preferenceCookieOptions);
  }
}
