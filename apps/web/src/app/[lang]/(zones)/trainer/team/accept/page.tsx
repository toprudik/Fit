import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { InviteAnswer } from "@/components/team/team";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadInvite } from "@/lib/delegations/load";
import { isInviteToken } from "@/lib/delegations/rules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.team.accept.title };
}

async function Invite({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/team/accept">["searchParams"] }) {
  const [params, t, locale] = await Promise.all([searchParams, getDictionary(), getLocale()]);
  const copy = t.team.accept;
  const token = typeof params.token === "string" && isInviteToken(params.token) ? params.token : null;
  const invite = token ? await loadInvite(token) : "not-found";
  const back = (
    <Link href="/trainer/team" className={buttonVariants({ variant: "secondary" })}>
      {copy.back}
    </Link>
  );
  if (invite === "signed-out") {
    const next = `/trainer/team/accept?token=${encodeURIComponent(token ?? "")}`;
    return (
      <EmptyState
        icon={UserPlus}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (invite === "not-found" || !token) return <EmptyState icon={UserPlus} title={copy.notFound} description={copy.notFoundText} action={back} />;
  if (invite === "expired") return <EmptyState icon={UserPlus} title={copy.expired} description={copy.expiredText} action={back} />;
  // The trainer opened their own link: there is nothing to accept, so say so instead of offering the buttons.
  if (invite.own) return <EmptyState icon={UserPlus} title={copy.title} description={copy.own} action={back} />;

  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: invite.timeZone,
  });
  const when = invite.sessionStartsAt ? format.format(new Date(invite.sessionStartsAt)) : "";
  const owner = invite.ownerName ?? "";
  const several = invite.kind === "substitute" && invite.sessionsStartsAt.length > 1;
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-callout">
        {several
          ? interpolate(copy.substitutesText, { owner, sessions: plural(locale, invite.sessionsStartsAt.length, copy.sessions) })
          : invite.kind === "substitute"
            ? interpolate(copy.substituteText, { owner, when })
            : interpolate(copy.assistantText, { owner })}
      </p>
      {several ? (
        <ListGroup header={copy.sessionsTitle}>
          {invite.sessionsStartsAt.map((startsAt) => (
            <ListRow key={startsAt} title={format.format(new Date(startsAt))} />
          ))}
        </ListGroup>
      ) : null}
      <ListGroup header={copy.scopesTitle} footer={t.team.form.moneyNote}>
        {invite.kind === "substitute" ? (
          <ListRow title={<span className="whitespace-normal">{copy.substituteScopes}</span>} />
        ) : (
          <>
            {invite.scopes.map((scope) => (
              <ListRow key={scope} title={scope in t.team.scopes ? t.team.scopes[scope as keyof typeof t.team.scopes] : scope} />
            ))}
            <ListRow title={invite.allClients ? copy.clientsAll : interpolate(copy.clientsCount, { count: invite.clients })} />
          </>
        )}
      </ListGroup>
      <InviteAnswer token={token} />
    </div>
  );
}

/** The invited trainer's page from the link (PRD wave-3 §1 rules 1–2): what is offered, then accept or decline. */
export default async function AcceptInvitePage(props: PageProps<"/[lang]/trainer/team/accept">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.team.accept.title} back={{ fallbackHref: "/trainer/team" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Invite searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
