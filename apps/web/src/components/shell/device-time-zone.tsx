"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "@/components/account/account-store";

export const TIME_ZONE_ENDPOINT = "/api/settings/time-zone";

/** sessionStorage key: the zone this tab already sent, so each screen does not send it again. */
const SENT_KEY = "dafit-time-zone-sent";

/**
 * The zone name to send for what the device reports. A WebView on Android with the zone set by hand (Telegram,
 * GMT in the settings) reports an offset like "+03:00" instead of a name: a whole-hour offset becomes the fixed
 * zone Etc/GMT-3 (POSIX signs are reversed), zero becomes UTC, anything else is not sent.
 */
export function deviceTimeZone(reported: string | undefined): string | null {
  if (!reported) return null;
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(reported);
  if (!offset) return reported;
  const [, sign, hours, minutes] = offset;
  if (minutes !== "00") return null;
  const value = Number(hours);
  if (value === 0) return "UTC";
  if (sign === "+" ? value > 14 : value > 12) return null;
  return `Etc/GMT${sign === "+" ? "-" : "+"}${value}`;
}

/**
 * Mounted in the zones shell. Once a client is signed in, sends the device's time zone to the account
 * once per tab and zone (PRD 2.6.7 rule 4), and re-renders the screen when the account's zone changed,
 * so times on it follow the device. A trainer's zone is their own (rule 1), so nothing is sent for
 * them. Failures are silent: the account keeps its previous zone.
 */
export function DeviceTimeZone() {
  const router = useRouter();
  const account = useAccount();
  const isClient = account.status === "signed-in" && !account.isTrainer;

  useEffect(() => {
    if (!isClient) return;
    const timeZone = deviceTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!timeZone) return;
    try {
      if (sessionStorage.getItem(SENT_KEY) === timeZone) return;
    } catch {
      // No storage (private mode): send anyway, the server ignores an unchanged zone.
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(TIME_ZONE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        try {
          sessionStorage.setItem(SENT_KEY, timeZone);
        } catch {
          // Nothing to remember it in; the next screen sends it again.
        }
        const result: { changed?: boolean } = await response.json();
        if (result.changed) router.refresh();
      } catch {
        // Offline or navigated away: the next screen tries again.
      }
    })();
    return () => controller.abort();
  }, [isClient, router]);

  return null;
}
