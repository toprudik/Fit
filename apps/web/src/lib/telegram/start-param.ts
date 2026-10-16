import { CLIENT_LINK_START_PREFIX, clientLinkPath, isClientLinkToken } from "@/lib/client-links/link";
import { isPairId } from "@/lib/pairs/clients";
import { isShowcaseSlug, SHOWCASE_START_PREFIX, showcasePath } from "@/lib/showcase/link";
import { INVITE_START_PREFIX, redeemPath } from "@/lib/trainer-invites/code";
import { isTrialToken, TRIAL_START_PREFIX, trialPath } from "@/lib/trial-links/link";

const TRAINER_PAY_PREFIX = "t_pay_";
const CLIENT_PASS_PREFIX = "c_pass_";

/** Telegram allows [A-Za-z0-9_-], at most 512 characters (screens.md §1.7). */
const START_PARAM = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * The screen a Mini App launch with `startapp=<param>` opens (screens.md §1.7), or null to stay on
 * the screen the launch URL opened. Only keys whose screens exist are listed; the rest arrive with
 * their features. Nothing from the parameter is trusted here: the screen checks it on the server.
 */
export function startParamPath(param: string | null | undefined): string | null {
  if (!param || !START_PARAM.test(param)) return null;
  if (param.startsWith(INVITE_START_PREFIX)) return redeemPath(param.slice(INVITE_START_PREFIX.length));
  if (param.startsWith(CLIENT_LINK_START_PREFIX)) {
    const token = param.slice(CLIENT_LINK_START_PREFIX.length);
    return isClientLinkToken(token) ? clientLinkPath(token) : null;
  }
  if (param.startsWith(TRIAL_START_PREFIX)) {
    const token = param.slice(TRIAL_START_PREFIX.length);
    return isTrialToken(token) ? trialPath(token) : null;
  }
  if (param.startsWith(SHOWCASE_START_PREFIX)) {
    const slug = param.slice(SHOWCASE_START_PREFIX.length);
    return isShowcaseSlug(slug) ? showcasePath(slug) : null;
  }
  // t_pay_<coachingId>: "Отметить оплату" of that client; c_pass_<passId>: the client's pass (К10, К11 buttons).
  if (param.startsWith(TRAINER_PAY_PREFIX)) {
    const id = param.slice(TRAINER_PAY_PREFIX.length);
    return isPairId(id) ? `/trainer/clients/${id}/payments?action=new` : null;
  }
  if (param.startsWith(CLIENT_PASS_PREFIX)) {
    const id = param.slice(CLIENT_PASS_PREFIX.length);
    return isPairId(id) ? `/client/passes/${id}` : null;
  }
  return null;
}
