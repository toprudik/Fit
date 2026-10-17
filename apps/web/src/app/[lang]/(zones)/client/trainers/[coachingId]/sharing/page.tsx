import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EndPairRow } from "@/components/pairs/pair-controls";
import { SharingSignedOut } from "@/components/sharing/sharing-signed-out";
import { SharingSwitches } from "@/components/sharing/sharing-settings";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { AssistantProgressSwitch } from "@/components/team/team";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadPairDelegates } from "@/lib/delegations/load";
import { clientPairPath } from "@/lib/intake/paths";
import { sharingPath } from "@/lib/sharing/categories";
import { loadClientSharing, SIGNED_OUT } from "@/lib/sharing/load";

// A pair id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.sharing.title };
}

type Params = PageProps<"/[lang]/client/trainers/[coachingId]/sharing">["params"];

async function Sharing({ params }: { params: Params }) {
  const { coachingId } = await params;
  const [t, sharing] = await Promise.all([getDictionary(), loadClientSharing(coachingId)]);
  if (sharing === SIGNED_OUT) return <SharingSignedOut t={t} next={sharingPath(coachingId)} />;
  if (!sharing) notFound();
  const copy = t.sharing;
  const name = sharing.trainerName || t.botMessages.unnamedTrainer;
  if (!sharing.live) {
    return <p className="rounded-lg bg-surface-1 p-4 text-callout text-ink-2">{copy.ended}</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="sharing-categories" className="flex flex-col gap-2">
        <h2 id="sharing-categories" className="px-4 text-footnote text-ink-2">
          {interpolate(copy.header, { name })}
        </h2>
        <SharingSwitches coachingId={sharing.coachingId} shares={sharing.shares} />
        <p className="px-4 text-footnote text-ink-2">{copy.footer}</p>
      </section>
      <Delegates coachingId={sharing.coachingId} />
      <ListGroup header={copy.revokeHeader} footer={copy.revokeFooter} headingLevel={2}>
        <EndPairRow coachingId={sharing.coachingId} side="client" partnerName={name} />
      </ListGroup>
    </div>
  );
}

/** Who else works with the client for this trainer, and the switch for assistants (PRD wave-3 §1 rules 5–6, 1.7). */
async function Delegates({ coachingId }: { coachingId: string }) {
  const [t, locale, { delegates, progressBlocked, timeZone }] = await Promise.all([getDictionary(), getLocale(), loadPairDelegates(coachingId)]);
  if (delegates.length === 0) return null;
  const copy = t.team.client;
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  const hasAssistant = delegates.some((row) => row.kind === "assistant");
  return (
    <ListGroup header={copy.header} footer={hasAssistant ? copy.progressHint : undefined} headingLevel={2}>
      {delegates.map((row, index) => (
        <ListRow
          key={index}
          title={
            row.kind === "substitute"
              ? interpolate(copy.substitute, { name: row.name ?? "", when: row.sessionStartsAt ? when.format(new Date(row.sessionStartsAt)) : "" })
              : interpolate(copy.assistant, { name: row.name ?? "" })
          }
        />
      ))}
      {hasAssistant ? (
        <div className="px-4 py-3">
          <AssistantProgressSwitch coachingId={coachingId} blocked={progressBlocked} />
        </div>
      ) : null}
    </ListGroup>
  );
}

async function Header({ params }: { params: Params }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.sharing.title} back={{ fallbackHref: clientPairPath(coachingId) }} />;
}

/**
 * "Доступ к данным" (screens.md, PRD wave-1 §2.12-4): what this pair's trainer sees, switch by switch, and
 * ending the pair to take all of it back (§2.12-5).
 */
export default async function SharingPage(props: PageProps<"/[lang]/client/trainers/[coachingId]/sharing">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.sharing.title} />}>
          <Header params={props.params} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <Sharing params={props.params} />
      </Suspense>
    </Screen>
  );
}
