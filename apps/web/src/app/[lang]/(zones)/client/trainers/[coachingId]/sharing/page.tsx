import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EndPairRow } from "@/components/pairs/pair-controls";
import { SharingSignedOut } from "@/components/sharing/sharing-signed-out";
import { SharingSwitches } from "@/components/sharing/sharing-settings";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
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
      <ListGroup header={copy.revokeHeader} footer={copy.revokeFooter} headingLevel={2}>
        <EndPairRow coachingId={sharing.coachingId} side="client" partnerName={name} />
      </ListGroup>
    </div>
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
