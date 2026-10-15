"use client";

import { useId, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatLongDate } from "@/i18n/format";

/** Local calendar day as YYYY-MM-DD: the `<time datetime>` value and a primitive snapshot that changes once a day. */
function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Re-renders at the next local midnight, so a screen left open overnight shows the new day. */
function subscribeToMidnight(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, midnight.getTime() - now.getTime());
  };
  schedule();
  return () => clearTimeout(timer);
}

const today = () => localDay(new Date());
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
 * Today's date for a screen subtitle: "Вторник, 13 октября" / "Tuesday, October 13", in the
 * viewer's time zone. The server sends an empty <time>; the inline script fills it before the first
 * paint on a full load, and client navigations format it while rendering. suppressHydrationWarning
 * keeps the script's text during hydration, until the client render brings the same value.
 */
export function TodayDate() {
  const { locale } = useI18n();
  const id = useId();
  const day = useSyncExternalStore(subscribeToMidnight, today, unknownDay);

  let text = "";
  if (day) {
    const [year, month, date] = day.split("-").map(Number);
    text = formatLongDate(locale, new Date(year, month - 1, date));
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
