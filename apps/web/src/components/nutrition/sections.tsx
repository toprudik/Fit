import { EyeOff, Utensils } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary, getLocale } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadMyNutrition, loadPairNutrition } from "@/lib/nutrition/load";
import { formatChange, formatValue } from "@/lib/progress/measurements";
import { NutritionCalculator } from "./calculator";
import { TargetCard } from "./target-card";
import { TargetChoice } from "./target-choice";
import { TARGET_PATH } from "./paths";
import { PairAdherence } from "./adherence";
import { TrainerFoodDay } from "./trainer-food-day";
import { ClearTargetButton, TrainerTargetForm } from "./trainer-target";

export { TARGET_PATH } from "./paths";

/** A new weight this far from the one of the calculation suggests working the target out again (§2.9). */
const WEIGHT_DRIFT_KG = 2;

/** "Цель и норма": the target in force with its source, the pick between trainers, and the calculator. */
export async function ClientNutrition() {
  const [t, locale, nutrition] = await Promise.all([getDictionary(), getLocale(), loadMyNutrition()]);
  const copy = t.nutrition;
  if (!nutrition) return <EmptyState icon={Utensils} title={t.progress.measurements.signedOut} />;
  const { active, calculator, trainerTargets } = nutrition;
  const source =
    active?.source === "trainer"
      ? active.trainerName
        ? interpolate(copy.target.sources.trainer, { name: active.trainerName })
        : copy.target.sources.trainerUnnamed
      : copy.target.sources.calculator;
  const drift =
    active?.source === "calculator" &&
    calculator?.weightKg != null &&
    nutrition.latestWeightKg !== null &&
    Math.abs(nutrition.latestWeightKg - calculator.weightKg) >= WEIGHT_DRIFT_KG
      ? formatChange(locale, "weight", calculator.weightKg, nutrition.latestWeightKg, t.progress.measurements.units)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {active ? (
        <TargetCard t={t} locale={locale} macros={active.macros} source={source} heading={copy.target.title}>
          {drift ? <p className="mt-2 text-footnote text-ink-2">{interpolate(copy.target.weightChanged, { change: drift })}</p> : null}
        </TargetCard>
      ) : (
        <EmptyState icon={Utensils} title={copy.target.none} description={copy.target.noneText} />
      )}
      {trainerTargets.length > 1 ? <TargetChoice targets={trainerTargets} /> : null}
      <NutritionCalculator
        initial={{ goal: nutrition.goal, ...nutrition.body }}
        latestWeightKg={nutrition.latestWeightKg}
        today={nutrition.today}
        trainerName={active?.source === "trainer" ? active.trainerName : null}
      />
    </div>
  );
}

/** The row on "Прогресс" that leads to "Цель и норма", with the goal and the target in force. */
export async function ClientNutritionEntry() {
  const [t, locale, nutrition] = await Promise.all([getDictionary(), getLocale(), loadMyNutrition()]);
  if (!nutrition) return null;
  const copy = t.nutrition;
  const subtitle = nutrition.active
    ? [nutrition.goal ? copy.goals[nutrition.goal] : null, interpolate(copy.target.kcal, { value: formatValue(locale, nutrition.active.macros.kcal) })]
        .filter(Boolean)
        .join(", ")
    : copy.entryEmpty;
  return (
    <ListGroup>
      <ListRow icon={Utensils} title={copy.entry} subtitle={subtitle} href={TARGET_PATH} chevron />
    </ListGroup>
  );
}

/** "Питание" on the trainer's client card: the goal, the trainer's own target, whose is active, and the diary. */
export async function TrainerNutrition({ coachingId, day }: { coachingId: string; day?: string }) {
  const [t, locale, nutrition] = await Promise.all([getDictionary(), getLocale(), loadPairNutrition(coachingId)]);
  const copy = t.nutrition.trainer;
  if (!nutrition || nutrition.state === "closed") {
    return <EmptyState icon={EyeOff} title={copy.closedTitle} description={copy.closedText} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <ListGroup>
        <ListRow title={copy.goal} value={nutrition.goal ? t.nutrition.goals[nutrition.goal] : copy.goalNone} />
      </ListGroup>
      {nutrition.mine ? (
        <TargetCard t={t} locale={locale} macros={nutrition.mine} source={copy.active[nutrition.active]} heading={copy.mine}>
          <div className="mt-3 flex flex-wrap gap-2">
            <TrainerTargetForm coachingId={coachingId} current={nutrition.mine} sex={nutrition.sex} />
            <ClearTargetButton coachingId={coachingId} />
          </div>
        </TargetCard>
      ) : (
        <section aria-label={copy.mine} className="flex flex-col items-start gap-3 rounded-lg bg-surface-1 p-4">
          <p className="text-callout">{copy.none}</p>
          <p className="text-footnote text-ink-2">{copy.active[nutrition.active]}</p>
          <TrainerTargetForm coachingId={coachingId} current={null} sex={nutrition.sex} />
        </section>
      )}
      {nutrition.calculator ? (
        <TargetCard t={t} locale={locale} macros={nutrition.calculator} heading={copy.calculator} />
      ) : null}
      <PairAdherence coachingId={coachingId} />
      <TrainerFoodDay coachingId={coachingId} day={day} />
    </div>
  );
}
