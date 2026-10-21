import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { IntakeSignedOut } from "@/components/intake/intake-signed-out";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SharingStep } from "@/components/sharing/sharing-step";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadClientIntake, SIGNED_OUT } from "@/lib/intake/load";
import { clientPairPath, intakeConsentPath } from "@/lib/intake/paths";

// A pair id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.intake.consent.title };
}

async function Consent({ params }: { params: PageProps<"/[lang]/client/trainers/[coachingId]/intake-consent">["params"] }) {
  const { coachingId } = await params;
  const [t, intake] = await Promise.all([getDictionary(), loadClientIntake(coachingId)]);
  if (intake === SIGNED_OUT) return <IntakeSignedOut t={t} next={intakeConsentPath(coachingId)} />;
  if (!intake || !intake.live) notFound();
  // The step is answered once; later changes happen on the intake page.
  if (intake.decided) redirect(clientPairPath(intake.coachingId));
  const copy = t.intake.consent;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body">{interpolate(copy.text, { name: intake.trainerName })}</p>
      <SharingStep coachingId={intake.coachingId} />
      <p className="text-footnote text-ink-2">{copy.hint}</p>
    </div>
  );
}

async function Header({ params }: { params: PageProps<"/[lang]/client/trainers/[coachingId]/intake-consent">["params"] }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.intake.consent.title} back={{ fallbackHref: clientPairPath(coachingId) }} />;
}

/**
 * «Что видит тренер» (screens.md "Согласие на анкету", flow 4a; legal product-changes А4): shown after a new pair
 * starts, before the intake. Until it is answered this trainer sees none of the categories.
 */
export default async function IntakeConsentPage(props: PageProps<"/[lang]/client/trainers/[coachingId]/intake-consent">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.intake.consent.title} />}>
          <Header params={props.params} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <Consent params={props.params} />
      </Suspense>
    </Screen>
  );
}
