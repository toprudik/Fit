import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries";
import { personName } from "@/lib/client-links/link";
import type { Database } from "@/lib/supabase/database.types";
import { JoinButton } from "./join-button";
import { TrainerCard } from "./trainer-card";

export type ResolvedInvite = Database["public"]["Functions"]["resolve_client_invite"]["Returns"][number];

function StatusText({ title, text }: { title: string; text?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-title-2">{title}</h2>
      {text ? <p className="text-callout text-ink-2">{text}</p> : null}
    </div>
  );
}

/**
 * What a signed-in person sees for a link or code that resolve_client_invite looked up: the trainer
 * and "Стать клиентом", their own pair, their own link, or why it does not work. `invalid` is left to
 * the caller, since the landing and the code screen answer it differently.
 */
export function InviteResult({
  t,
  invite,
  token,
  code,
}: {
  t: Dictionary;
  invite: ResolvedInvite & { status: "valid" | "joined" | "own" | "unavailable" };
  token?: string;
  code?: string;
}) {
  const copy = t.clientLinks.landing;
  if (invite.status === "unavailable") return <StatusText title={copy.unavailable.title} text={copy.unavailable.text} />;
  if (invite.status === "own") {
    return (
      <div className="flex flex-col gap-6">
        <StatusText title={copy.own.title} text={copy.own.text} />
        <Button asChild size="lg" block>
          <Link href="/trainer/links">{copy.own.action}</Link>
        </Button>
      </div>
    );
  }

  const trainer = {
    firstName: invite.first_name,
    lastName: invite.last_name,
    photoUrl: invite.photo_url,
    headline: invite.headline,
    specialties: invite.specialties ?? [],
    worksOffline: invite.works_offline,
    worksOnline: invite.works_online,
    verified: invite.verified,
  };
  return (
    <div className="flex flex-col gap-6">
      <TrainerCard t={t} trainer={trainer} />
      {invite.status === "joined" ? (
        <div className="flex flex-col gap-4">
          <p className="text-callout">{copy.joined.title}</p>
          <Button asChild size="lg" block>
            <Link href="/client/trainers">{copy.joined.action}</Link>
          </Button>
        </div>
      ) : (
        <JoinButton token={token} code={code} trainerName={personName(invite.first_name, invite.last_name)} />
      )}
    </div>
  );
}

/** The four statuses InviteResult shows; `invalid` and anything unknown stay with the caller. */
export function isShownStatus(invite: ResolvedInvite | undefined): invite is ResolvedInvite & { status: "valid" | "joined" | "own" | "unavailable" } {
  return invite !== undefined && ["valid", "joined", "own", "unavailable"].includes(invite.status);
}
