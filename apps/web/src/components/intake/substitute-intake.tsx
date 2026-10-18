import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadSubstituteIntake } from "@/lib/intake/load";
import { formatIntakeDate } from "./format";
import { IntakeAnswers, ParqFlag } from "./intake-answers";

/**
 * "Анкета" of a participant for the substitute (PRD wave-3 §1 "Подмена" rule 4): read-only, with PAR-Q risks
 * highlighted, and only while the client shows it to their trainer.
 */
export async function SubstituteIntake({ clientId, timeZone }: { clientId: string; timeZone: string }) {
  const [t, locale, intake] = await Promise.all([getDictionary(), getLocale(), loadSubstituteIntake(clientId)]);
  if (!intake) return <EmptyState icon={ClipboardList} title={t.substitute.noIntake} description={t.substitute.noIntakeText} />;
  const { first, latest } = intake;
  const date = (iso: string) => formatIntakeDate(locale, iso, timeZone);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5 px-4 text-footnote text-ink-2">
        <p>{interpolate(t.intake.trainer.submitted, { date: date(first) })}</p>
        {first !== latest.submittedAt ? <p>{interpolate(t.intake.trainer.updated, { date: date(latest.submittedAt) })}</p> : null}
      </div>
      {latest.parqFlagged ? <ParqFlag t={t} /> : null}
      <IntakeAnswers t={t} intake={latest} changed={new Set()} />
    </div>
  );
}
