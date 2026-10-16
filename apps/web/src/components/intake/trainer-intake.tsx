import { EyeOff, ClipboardList } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadTrainerIntake, SIGNED_OUT } from "@/lib/intake/load";
import { trainerIntakePath } from "@/lib/intake/paths";
import { formatIntakeDate } from "./format";
import { IntakeAnswers, ParqFlag } from "./intake-answers";
import { IntakeSignedOut } from "./intake-signed-out";
import { MarkIntakeSeen } from "./mark-intake-seen";
import { RemindIntakeButton } from "./remind-intake-button";

/**
 * The client card's "Анкета" (screens.md "↳ Анкета"): the answers with PAR-Q risks highlighted, or
 * "Клиент ещё не заполнил анкету" with "Напомнить", or "Анкета скрыта клиентом" with no way to ask (Q38).
 */
export async function TrainerIntake({ coachingId }: { coachingId: string }) {
  const [t, locale, intake] = await Promise.all([getDictionary(), getLocale(), loadTrainerIntake(coachingId)]);
  if (intake === SIGNED_OUT) return <IntakeSignedOut t={t} next={trainerIntakePath(coachingId)} />;
  if (!intake) notFound();
  const copy = t.intake.trainer;

  if (intake.state === "hidden") {
    return <EmptyState icon={EyeOff} title={copy.hidden} description={copy.hiddenText} />;
  }
  if (intake.state === "empty") {
    return (
      <EmptyState
        icon={ClipboardList}
        title={copy.empty}
        description={copy.emptyText}
        action={<RemindIntakeButton coachingId={intake.coachingId} />}
      />
    );
  }

  const { latest, first, timeZone } = intake;
  const date = (iso: string) => formatIntakeDate(locale, iso, timeZone);
  return (
    <div className="flex flex-col gap-6">
      <MarkIntakeSeen coachingId={intake.coachingId} submittedAt={latest.submittedAt} />
      <div className="flex flex-col gap-0.5 px-4 text-footnote text-ink-2">
        <p>{interpolate(copy.submitted, { date: date(first) })}</p>
        {first !== latest.submittedAt ? <p>{interpolate(copy.updated, { date: date(latest.submittedAt) })}</p> : null}
      </div>
      {latest.parqFlagged ? <ParqFlag t={t} /> : null}
      <IntakeAnswers t={t} intake={latest} changed={intake.changed} />
    </div>
  );
}
