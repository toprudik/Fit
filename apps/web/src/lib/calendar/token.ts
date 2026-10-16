/** Feed tokens are base64url (create_calendar_feed); a trailing ".ics" is allowed for calendar apps. */
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

export function feedToken(value: string): string | null {
  const token = value.endsWith(".ics") ? value.slice(0, -4) : value;
  return TOKEN.test(token) ? token : null;
}

/** The https and webcal:// addresses of a feed: copy the first, open the second in Apple Calendar. */
export function feedUrls(appUrl: string, token: string): { https: string; webcal: string; google: string } {
  const https = new URL(`/api/calendar/${token}.ics`, appUrl).toString();
  const webcal = https.replace(/^https?:/, "webcal:");
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  };
}
