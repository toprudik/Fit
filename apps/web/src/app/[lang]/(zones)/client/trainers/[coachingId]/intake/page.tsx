import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HealthNotice } from "@/components/health/health-notice";
import { formatIntakeDate } from "@/components/intake/format";
import { IntakeForm } from "@/components/intake/intake-form";
import { IntakeSignedOut } from "@/components/intake/intake-signed-out";
import { IntakeShareToggle } from "@/components/intake/intake-share-toggle";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { hasSeenHealthNotice } from "@/lib/health-notice/seen";
import { toValues } from "@/lib/intake/form";
import { loadClientIntake, SIGNED_OUT } from "@/lib/intake/load";
import { clientIntakePath, clientPairPath } from "@/lib/intake/paths";
import { clientGoalPath, loadOwnGoal } from "@/lib/onboarding/goal";

// A pair id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.intake.form.title };
}

type Params = PageProps<"/[lang]/client/trainers/[coachingId]/intake">["params"];

async function Intake({ params }: { params: Params }) {
  const { coachingId } = await params;
  const [t, locale, intake, goal, noticeSeen] = await Promise.all([
    getDictionary(),
    getLocale(),
    loadClientIntake(coachingId),
    loadOwnGoal(),
    hasSeenHealthNotice(),
  ]);
  if (intake === SIGNED_OUT) return <IntakeSignedOut t={t} next={clientIntakePath(coachingId)} />;
  if (!intake) notFound();
  const copy = t.intake.form;
  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="text-subhead text-ink-2">{copy.text}</p>
      {intake.latest ? (
        <p className="text-footnote text-ink-2">
          {interpolate(copy.updated, { date: formatIntakeDate(locale, intake.latest.submittedAt, intake.timeZone) })}
        </p>
      ) : null}
      {intake.live ? <IntakeShareToggle coachingId={intake.coachingId} shared={intake.shared} trainerName={intake.trainerName} /> : null}
      {/* The health notice comes before the first intake (legal health-disclaimer §2, product change 8). */}
      {noticeSeen ? (
        <IntakeForm
          coachingId={intake.coachingId}
          initial={intake.latest ? toValues(intake.latest) : null}
          goalHref={goal ? null : clientGoalPath(intake.coachingId)}
        />
      ) : (
        <HealthNotice />
      )}
    </div>
  );
}

async function Header({ params }: { params: Params }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.intake.form.title} back={{ fallbackHref: clientPairPath(coachingId) }} />;
}

/**
 * The client's intake (screens.md "Анкета клиента"): one per person, opened from a pair. Here the client also
 * sees whether this pair's trainer may read it and can change that.
 */
export default async function ClientIntakePage(props: PageProps<"/[lang]/client/trainers/[coachingId]/intake">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.intake.form.title} />}>
          <Header params={props.params} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <Intake params={props.params} />
      </Suspense>
    </Screen>
  );
}
