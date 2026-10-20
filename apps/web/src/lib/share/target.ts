import { isClientLinkToken, clientLinkPath, clientLinkTelegram } from "@/lib/client-links/link";
import { isReferralCode, referralTelegram } from "@/lib/referrals/link";
import { INVITE_CODE_LENGTH, inviteTelegramLink, normalizeInviteCode, redeemPath } from "@/lib/trainer-invites/code";

/**
 * What a shared link is, read back from the link itself (marketing backlog 11): a client's referral link, a trainer's
 * invitation for trainers or a trainer's link for clients. Only links of this app count, so a prepared message never
 * carries a button to anywhere else. `telegram` is the t.me link that opens the same screen in the Mini App.
 */
export type ShareTarget = { kind: "referral" | "trainer_invite" | "client_link"; telegram: string };

export function shareTarget(link: string, appUrl: string, botUsername: string): ShareTarget | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.origin !== new URL(appUrl).origin) return null;

  const referral = /^\/r\/([^/]+)$/.exec(url.pathname)?.[1];
  if (isReferralCode(referral)) return { kind: "referral", telegram: referralTelegram(referral, botUsername) };

  const token = /^\/i\/([^/]+)$/.exec(url.pathname)?.[1];
  if (isClientLinkToken(token) && url.pathname === clientLinkPath(token)) {
    return { kind: "client_link", telegram: clientLinkTelegram(token, botUsername) };
  }

  const code = normalizeInviteCode(url.searchParams.get("code") ?? "");
  if (code.length === INVITE_CODE_LENGTH && `${url.pathname}${url.search}` === redeemPath(code)) {
    return { kind: "trainer_invite", telegram: inviteTelegramLink(code, botUsername) };
  }
  return null;
}
