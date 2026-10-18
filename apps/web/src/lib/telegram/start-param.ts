import { splitStartParam } from "@/lib/attribution/source";
import { checkInPath, parseCheckInStartParam, parsePlaceCheckInStartParam } from "@/lib/check-in/link";
import { CLIENT_LINK_START_PREFIX, clientLinkPath, isClientLinkToken } from "@/lib/client-links/link";
import { CONTACT_START_PREFIX, contactRequestPath, isContactRequestId } from "@/lib/contact/request";
import { isPairId } from "@/lib/pairs/clients";
import { isReferralCode, REFERRAL_START_PREFIX, referralPath } from "@/lib/referrals/link";
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
  // A channel label (`ch_<label>`, or the suffix `__s_<label>`) only says where the person came from; the
  // screen is the one the rest names. A token that happens to contain the suffix still opens as it is.
  const { param: rest, label } = splitStartParam(param);
  return (label ? screenPath(rest) : null) ?? screenPath(param);
}

function screenPath(param: string): string | null {
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
  // rf_<code>: a client's referral link (PRD wave-3 §3.1-3).
  if (param.startsWith(REFERRAL_START_PREFIX)) {
    const code = param.slice(REFERRAL_START_PREFIX.length);
    return isReferralCode(code) ? referralPath(code) : null;
  }
  // cr_<request id>: the answer to "Попросить связаться", opened from the website (PRIV-2).
  if (param.startsWith(CONTACT_START_PREFIX)) {
    const id = param.slice(CONTACT_START_PREFIX.length);
    return isContactRequestId(id) ? contactRequestPath(id) : null;
  }
  // t_pay_<coachingId>: "Отметить оплату" of that client; c_pass_<passId>: the client's pass (К10, К11 buttons).
  if (param.startsWith(TRAINER_PAY_PREFIX)) {
    const id = param.slice(TRAINER_PAY_PREFIX.length);
    return isPairId(id) ? `/trainer/clients/${id}/payments?action=new` : null;
  }
  // ck_<session id>_<code>: the trainer's check-in QR (PRD wave-3 §5).
  const checkIn = parseCheckInStartParam(param);
  if (checkIn) return checkInPath(checkIn.sessionId, checkIn.code);
  // cl_<token>: the printed check-in QR of a location (§5 rule 2b).
  const place = parsePlaceCheckInStartParam(param);
  if (place) return place;
  if (param.startsWith(CLIENT_PASS_PREFIX)) {
    const id = param.slice(CLIENT_PASS_PREFIX.length);
    return isPairId(id) ? `/client/passes/${id}` : null;
  }
  return null;
}
