"use client";

import { Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { formatNumber, interpolate, plural } from "@/i18n/format";
import { formatSleep, parseSleep, parseSteps, WATER_ML_MAX, WATER_PORTIONS, type ActivityDay } from "@/lib/activity/activity";
import { addWater, setSleep, setSteps, undoWater, type ActivityResult } from "@/lib/activity/actions";

const QUALITIES = [1, 2, 3, 4, 5] as const;

function Card({ title, value, children }: { title: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline">{title}</h2>
        <p className="text-subhead text-ink-2 tabular-nums">{value}</p>
      </div>
      {children}
    </section>
  );
}

function Progress({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%` }} />
    </div>
  );
}

/** Runs an action and tells how it went; true when it worked. */
function useSave() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActivityResult>, done: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.reason === "bad_day" ? t.activity.badDay : t.activity.failed);
        return;
      }
      after?.();
      toast.success(done);
    });
  return { pending, run };
}

/** "Шаги": the day's steps against the goal, and a field for typing them by hand (wave-2 §4.2–4.3). */
export function StepsCard({ day, steps, goal }: { day: string; steps: ActivityDay["steps"]; goal: number }) {
  const { t, locale } = useI18n();
  const copy = t.activity.steps;
  const { pending, run } = useSave();
  const [error, setError] = useState<string>();
  const manual = steps?.source === "manual";

  function submit(formData: FormData) {
    const value = parseSteps(String(formData.get("steps") ?? ""));
    if (value === null) {
      setError(copy.error);
      return;
    }
    setError(undefined);
    run(() => setSteps({ day, steps: value }), copy.saved);
  }

  return (
    <Card title={copy.title} value={interpolate(copy.goal, { goal: formatNumber(locale, goal) })}>
      <p className="text-title-2 tabular-nums">
        {steps ? plural(locale, steps.value, copy.count) : plural(locale, 0, copy.count)}
        {steps ? <span className="ml-2 text-footnote text-ink-2">{manual ? copy.manual : copy.ios}</span> : null}
      </p>
      <Progress label={copy.title} value={steps?.value ?? 0} max={goal} />
      <form key={`${day}-${steps?.value ?? ""}`} action={submit} noValidate className="flex items-end gap-2">
        <TextField
          name="steps"
          label={copy.label}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={steps?.source === "manual" ? String(steps.value) : ""}
          error={error}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" loading={pending} className="mb-px shrink-0">
          {t.activity.save}
        </Button>
      </form>
      {manual ? (
        <Button variant="ghost" size="sm" disabled={pending} className="self-start" onClick={() => run(() => setSteps({ day, steps: null }), copy.cleared)}>
          {copy.clear}
        </Button>
      ) : null}
    </Card>
  );
}

/** "Вода": +250 and +500 ml, an own amount, and taking back the latest (wave-2 §4.5). */
export function WaterCard({ day, waterMl, goal }: { day: string; waterMl: number; goal: number | null }) {
  const { t, locale } = useI18n();
  const copy = t.activity.water;
  const { pending, run } = useSave();
  const [error, setError] = useState<string>();
  const [custom, setCustom] = useState("");
  const ml = (value: number) => formatNumber(locale, value);

  function add(value: number, after?: () => void) {
    run(() => addWater({ day, ml: value }), interpolate(copy.added, { ml: ml(value) }), after);
  }

  function submit(formData: FormData) {
    const text = String(formData.get("water") ?? "").replace(/\s/g, "");
    const value = /^\d{1,4}$/.test(text) ? Number(text) : 0;
    if (value < 1 || value > WATER_ML_MAX) {
      setError(copy.error);
      return;
    }
    setError(undefined);
    add(value, () => setCustom(""));
  }

  return (
    <Card title={copy.title} value={goal ? interpolate(copy.goal, { goal: ml(goal) }) : null}>
      <p className="text-title-2 tabular-nums">{interpolate(copy.amount, { ml: ml(waterMl) })}</p>
      {goal ? <Progress label={copy.title} value={waterMl} max={goal} /> : null}
      <div className="flex flex-wrap gap-2">
        {WATER_PORTIONS.map((portion) => (
          <Button key={portion} variant="secondary" disabled={pending} onClick={() => add(portion)}>
            {interpolate(copy.add, { ml: ml(portion) })}
          </Button>
        ))}
        {waterMl ? (
          <Button variant="ghost" icon={Undo2} disabled={pending} onClick={() => run(() => undoWater(day), copy.undone)}>
            {copy.undo}
          </Button>
        ) : null}
      </div>
      <form action={submit} noValidate className="flex items-end gap-2">
        <TextField
          name="water"
          label={copy.custom}
          inputMode="numeric"
          autoComplete="off"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          error={error}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" loading={pending} className="mb-px shrink-0">
          {copy.addCustom}
        </Button>
      </form>
    </Card>
  );
}

/** "Сон": hours and minutes for the day of waking up, with an optional quality 1–5 (wave-2 §4.6). */
export function SleepCard({ day, sleep }: { day: string; sleep: ActivityDay["sleep"] }) {
  const { t } = useI18n();
  const copy = t.activity.sleep;
  const { pending, run } = useSave();
  const [error, setError] = useState<string>();
  const [quality, setQuality] = useState<number | null>(sleep?.quality ?? null);

  function submit(formData: FormData) {
    const minutes = parseSleep(String(formData.get("sleep") ?? ""));
    if (minutes === null) {
      setError(copy.error);
      return;
    }
    setError(undefined);
    run(() => setSleep({ day, minutes, quality }), copy.saved);
  }

  return (
    <Card title={copy.title} value={sleep?.quality ? interpolate(copy.qualityOption, { n: sleep.quality }) : null}>
      <p className="text-title-2 tabular-nums">{sleep ? formatSleep(sleep.minutes) : "0:00"}</p>
      <form key={`${day}-${sleep?.minutes ?? ""}`} action={submit} noValidate className="flex flex-col gap-3">
        <TextField
          name="sleep"
          label={copy.label}
          hint={copy.hint}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={sleep ? formatSleep(sleep.minutes) : ""}
          error={error}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.quality}</legend>
          <div className="flex flex-wrap gap-2">
            {QUALITIES.map((n) => (
              <ChipRadio key={n} name="quality" value={n} checked={quality === n} onChange={() => setQuality(n)}>
                {interpolate(copy.qualityOption, { n })}
              </ChipRadio>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" loading={pending}>
            {t.activity.save}
          </Button>
          {sleep ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => setSleep({ day, minutes: null, quality: null }), copy.cleared, () => setQuality(null))}
            >
              {copy.clear}
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
