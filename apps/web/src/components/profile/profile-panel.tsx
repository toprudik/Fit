"use client";

import { BadgeCheck, KeyRound, LogOut, Settings, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-store";
import { useOptionalShell } from "@/components/shell/shell-context";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/client";
import { DEFAULT_ZONE, ZONES, type Zone } from "@/lib/navigation/zones";
import { useMiniAppSignIn } from "@/lib/telegram/mini-app";

function SignedOut({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  // Only rendered once the account is known, which never happens on the server, so the path the
  // browser shows is safe to read here (the server would see the /<locale> rewrite instead).
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <PersonAvatar name="" size={64} fallbackIcon={User} />
        <p className="min-w-0 flex-1 text-callout text-ink-2">{t.profile.signedOutText}</p>
      </div>
      {/* Full width under the thumb on a phone; on wider screens a button the width of a page column looks lost. */}
      <Button asChild className="w-full md:w-fit md:self-start">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} onClick={onNavigate}>
          {t.profile.signIn}
        </Link>
      </Button>
    </div>
  );
}

function AccountBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const account = useAccount();

  if (account.status === "loading") {
    return (
      <div role="status" aria-label={t.common.loading} className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0" />
        <Skeleton className="h-5 w-40" />
      </div>
    );
  }
  if (account.status === "signed-out") return <SignedOut onNavigate={onNavigate} />;
  return (
    <div className="flex items-center gap-4">
      {/* The name is written next to it, so the photo needs no label of its own. */}
      <PersonAvatar name={account.name} src={account.photoUrl} size={64} decorative fallbackIcon={User} />
      <p className="min-w-0 flex-1 text-title-3 break-words">{account.name}</p>
    </div>
  );
}

type ProfilePanelProps = {
  /**
   * Called as a choice here starts a navigation (another zone, settings, sign-in), before the new
   * screen arrives, so a sheet can close first.
   */
  onNavigate?: () => void;
  /** `raised` when the panel sits on surface-1 itself, as in the sheet: the list group steps up to surface-2. */
  groupSurface?: "default" | "raised";
};

/**
 * Profile content shared by the sheet behind the avatar and the /profile page
 * (docs/architecture/screens.md §2.3): who is signed in, the zone switch, settings, the admin
 * section for admins, the trainer invite for everyone who is not a trainer yet and, on the website,
 * sign-out. The zone switch shows the zone the shell shows.
 */
export function ProfilePanel({ onNavigate, groupSurface = "default" }: ProfilePanelProps) {
  const { t } = useI18n();
  const router = useRouter();
  const account = useAccount();
  // Inside Telegram the account is the Telegram account the Mini App was opened with, and the next
  // page load would sign it in again from initData: no sign-out there (ADR 0004).
  const inTelegram = useMiniAppSignIn() !== null;
  const known = useOptionalShell()?.zone ?? null;
  const signOutForm = useRef<HTMLFormElement>(null);
  // The zone just picked: the thumb moves right away, before the new zone's screen arrives.
  const [picked, setPicked] = useState<Zone | null>(null);

  // Next.js keeps a page it navigates away from (React Activity). Forget the pick when this one is
  // hidden, so coming back shows the zone actually open, not the one picked last time.
  useLayoutEffect(() => () => setPicked(null), []);

  const zoneOptions = ZONES.map((value) => ({ value, label: t.zones[value] }));

  function pickZone(next: Zone) {
    setPicked(next);
    onNavigate?.();
    router.push(`/${next}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <AccountBlock onNavigate={onNavigate} />
      <SegmentedControl
        // On /profile opened directly the zone is read in the browser only: remount once it is known,
        // so the thumb starts there instead of sliding over from the default on every page load.
        key={known ? "known" : "default"}
        label={t.zones.label}
        options={zoneOptions}
        value={picked ?? known ?? DEFAULT_ZONE}
        onValueChange={pickZone}
      />
      <ListGroup surface={groupSurface}>
        <ListRow icon={Settings} title={t.profile.settings} href="/settings" onClick={onNavigate} />
        {account.status === "signed-in" && account.isAdmin ? (
          <ListRow icon={ShieldCheck} title={t.profile.admin} href="/admin" onClick={onNavigate} />
        ) : null}
        {account.status === "signed-in" && account.isTrainer ? (
          <ListRow icon={BadgeCheck} title={t.profile.verification} href="/trainer/verification" onClick={onNavigate} />
        ) : null}
        {/* Only people without a trainer profile: nobody else sees a way to become a trainer (TINV-1). */}
        {account.status === "signed-in" && !account.isTrainer ? (
          <ListRow icon={KeyRound} title={t.profile.trainerInvite} href="/onboarding/trainer" onClick={onNavigate} />
        ) : null}
        {account.status === "signed-in" && !inTelegram ? (
          // A plain POST, like the auth routes expect (same-origin check, then a redirect to /login).
          <form ref={signOutForm} method="post" action="/auth/sign-out">
            <ListRow
              icon={LogOut}
              title={t.profile.signOut}
              tone="danger"
              chevron={false}
              onClick={() => signOutForm.current?.requestSubmit()}
            />
          </form>
        ) : null}
      </ListGroup>
    </div>
  );
}
