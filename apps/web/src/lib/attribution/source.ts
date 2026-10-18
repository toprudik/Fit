/**
 * Where a new account came from (marketing backlog 1): a channel label in the link that brought the person.
 *   * Mini App: `startapp=ch_<label>` (the links in DaFit's own channels) or any start parameter with the
 *     suffix `__s_<label>`, such as `tp_<slug>__s_vk`.
 *   * Website: `?src=<label>`, or the usual `utm_source` with `utm_campaign`.
 *   * The bot's answer to `/start <payload>`: its Mini App button opens `?tgWebAppStartParam=<payload>`, which
 *     Telegram does not sign, so the first page load keeps it like a website label.
 * A label is a short lowercase word, never a person: the database keeps only these words for each account.
 */

/** The cookie that keeps the first label a browser arrived with until it signs in. */
export const SOURCE_COOKIE = "dafit_src";

export const SOURCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** The start parameter of a link from one of DaFit's own channels: `ch_tg`, `ch_vk`, … */
export const CHANNEL_START_PREFIX = "ch_";

/** The suffix that adds a label to any other start parameter. */
export const SOURCE_START_SEPARATOR = "__s_";

const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type SignupSource = { source: string; campaign: string | null };

/** A label as the database takes it, lowercased; null when it is missing or not a plain word. */
export function sourceLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const label = value.trim().toLowerCase();
  return LABEL.test(label) ? label : null;
}

/** The start parameter without its `__s_<label>` suffix, and the label; the parameter as is when it has none. */
export function splitStartParam(param: string): { param: string; label: string | null } {
  const at = param.lastIndexOf(SOURCE_START_SEPARATOR);
  if (at <= 0) return { param, label: null };
  const label = sourceLabel(param.slice(at + SOURCE_START_SEPARATOR.length));
  return label ? { param: param.slice(0, at), label } : { param, label: null };
}

/** The source a Mini App start parameter names, or null. */
export function sourceFromStartParam(param: string | null | undefined): SignupSource | null {
  if (!param) return null;
  if (param.startsWith(CHANNEL_START_PREFIX)) {
    const source = sourceLabel(param.slice(CHANNEL_START_PREFIX.length));
    return source ? { source, campaign: null } : null;
  }
  const { label } = splitStartParam(param);
  return label ? { source: label, campaign: null } : null;
}

/** The source in a page address: `src` first, then `utm_source` with `utm_campaign`, then the bot's start parameter. */
export function sourceFromSearch(params: URLSearchParams): SignupSource | null {
  const source = sourceLabel(params.get("src")) ?? sourceLabel(params.get("utm_source"));
  if (source) return { source, campaign: sourceLabel(params.get("utm_campaign")) };
  return sourceFromStartParam(params.get("tgWebAppStartParam"));
}

/** The cookie value: "label" or "label.campaign" (a dot is not part of a label). */
export function sourceCookieValue(source: SignupSource): string {
  return source.campaign ? `${source.source}.${source.campaign}` : source.source;
}

export function parseSourceCookie(value: string | null | undefined): SignupSource | null {
  if (!value) return null;
  const [rawSource, rawCampaign, ...rest] = value.split(".");
  const source = sourceLabel(rawSource);
  if (!source || rest.length > 0) return null;
  return { source, campaign: sourceLabel(rawCampaign) };
}
