import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IntakeSignedOut } from "@/components/intake/intake-signed-out";
import { GoalStep } from "@/components/onboarding/goal-step";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadClientIntake, SIGNED_OUT } from "@/lib/intake/load";
import { clientPairPath } from "@/lib/intake/paths";
import { clientGoalPath, loadOwnGoal } from "@/lib/onboarding/goal";

// A pair id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.goalStep.title };
}

type Params = PageProps<"/[lang]/client/trainers/[coachingId]/goal">["params"];

async function Goal({ params }: { params: Params }) {
  const { coachingId } = await params;
  const [t, intake, goal] = await Promise.all([getDictionary(), loadClientIntake(coachingId), loadOwnGoal()]);
  if (intake === SIGNED_OUT) return <IntakeSignedOut t={t} next={clientGoalPath(coachingId)} />;
  if (!intake || !intake.live) notFound();
  return (
    <div className="flex flex-col gap-6">
      <p className="px-4 text-body">{t.goalStep.text}</p>
      <GoalStep initial={goal} doneHref={clientPairPath(intake.coachingId)} />
    </div>
  );
}

async function Header({ params }: { params: Params }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.goalStep.title} back={{ fallbackHref: clientPairPath(coachingId) }} />;
}

/**
 * "Выбери цель" (wave-2 §1 rule 4, screens.md "Цель после анкеты"): the last step of a new pair's onboarding, after
 * the intake is sent. It can be skipped; the goal changes later on "Цель и норма".
 */
export default async function ClientGoalPage(props: PageProps<"/[lang]/client/trainers/[coachingId]/goal">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.goalStep.title} />}>
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
        <Goal params={props.params} />
      </Suspense>
    </Screen>
  );
}
