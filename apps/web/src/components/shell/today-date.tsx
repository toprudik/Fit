"use client";

import { useId, useSyncExternalStore } from "react";
import { useAccount } from "@/components/account/account-store";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatLongDate } from "@/i18n/format";

/**
 * The calendar day as YYYY-MM-DD in a time zone (the device's when none is given): the `<time datetime>` value
 * and a primitive snapshot that changes once a day.
 */
function dayIn(timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    // An unknown zone name: the device's day is still a day.
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

/**
 * Checks the day at every full minute, so a screen left open overnight shows the new day. The account's zone
 * can be another than the device's, so its midnight can't be scheduled from the device clock (zone offsets
 * are whole minutes); an unchanged snapshot re-renders nothing.
 */
function subscribeToMinutes(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, 60_000 - (Date.now() % 60_000));
  };
  schedule();
  return () => clearTimeout(timer);
}

// Prerendered pages can't read the clock (and the server doesn't know the viewer's time zone).
const unknownDay = () => "";

/**
 * Same text as formatLongDate(), filled in by an inline script while the HTML is parsed, so a full
 * page load shows the date in the first paint. Keep the two in step (today-date.test.tsx checks it).
 */
export function todayDateScript(id: string, locale: Locale): string {
  const tag = JSON.stringify(INTL_LOCALE[locale]);
  return (
    `(function(){var n=document.getElementById(${JSON.stringify(id)});if(!n)return;` +
    `var d=new Date(),p=function(v){return(v<10?"0":"")+v};` +
    `var s=new Intl.DateTimeFormat(${tag},{weekday:"long",day:"numeric",month:"long"}).format(d);` +
    `n.textContent=s.charAt(0).toLocaleUpperCase(${tag})+s.slice(1);` +
    `n.setAttribute("datetime",d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()))})()`
  );
}

/**
 * Runs on the server's HTML only. A script rendered by the client never executes, and marking it
 * text/plain there keeps React from warning about it (Next.js "Preventing flash before hydration").
 */
function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Today's date for a screen subtitle: "Вторник, 13 октября" / "Tuesday, October 13", in the account's
 * time zone, the one the screen's sessions are counted in; until the account arrives (and signed out), in
 * the device's. The server sends an empty <time>; the inline script fills it with the device's day before
 * the first paint on a full load, and client navigations format it while rendering. suppressHydrationWarning
 * keeps the script's text during hydration, until the client render brings the same value.
 */
export function TodayDate() {
  const { locale } = useI18n();
  const id = useId();
  const account = useAccount();
  const timeZone = account.status === "signed-in" ? account.timeZone : undefined;
  const day = useSyncExternalStore(subscribeToMinutes, () => dayIn(timeZone), unknownDay);

  let text = "";
  if (day) {
    // Noon UTC of that day, formatted in UTC: the same calendar day whatever the device's zone.
    const [year, month, date] = day.split("-").map(Number);
    text = formatLongDate(locale, new Date(Date.UTC(year, month - 1, date, 12)), "UTC");
  }

  return (
    <>
      <time id={id} dateTime={day || undefined} suppressHydrationWarning>
        {text}
      </time>
      <InlineScript html={todayDateScript(id, locale)} />
    </>
  );
}
