"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { adjustPass, recordPastSession, waiveCharge } from "@/lib/passes/actions";
import type { DebtCharge, PassView } from "@/lib/passes/load";
import { formatNoteTime } from "@/lib/pairs/format";
import { useReport } from "./use-report";

/** What "Простить" was pressed on: a charge, and the pass it returns to (null for a debt). */
export type WaiveTarget = { chargeId: string; passTitle: string | null };

/** "Простить списание?" (PRD 2.6.6-4): an optional reason; a waiver is final. */
export function WaiveForm({ target, onDone }: { target: WaiveTarget; onDone: () => void }) {
  const { t } = useI18n();
  const copy = t.money.passes.waiveForm;
  const report = useReport();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          if (report(await waiveCharge({ chargeId: target.chargeId, reason }), copy.done, copy.waived)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">
        {target.passTitle ? interpolate(copy.textPass, { pass: target.passTitle }) : copy.textDebt}
      </p>
      <TextField label={copy.reason} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} autoComplete="off" />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** "Корректировка" (R84): add or take off some sessions with a comment, never below zero. */
export function AdjustForm({ pass, onDone }: { pass: PassView; onDone: () => void }) {
  const { t } = useI18n();
  const copy = t.money.passes.adjustForm;
  const report = useReport();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [sessions, setSessions] = useState("1");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const count = Number.parseInt(sessions, 10);
        startTransition(async () => {
          const result = await adjustPass({
            passId: pass.id,
            delta: Number.isFinite(count) ? (direction === "add" ? count : -count) : 0,
            note,
          });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (report(result, copy.done, copy.overdrawn)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <SegmentedControl
        label={copy.direction}
        value={direction}
        onValueChange={setDirection}
        options={[
          { value: "add", label: copy.add },
          { value: "remove", label: copy.remove },
        ]}
      />
      <TextField
        label={copy.sessions}
        inputMode="numeric"
        value={sessions}
        onChange={(event) => setSessions(event.target.value.replace(/\D/g, ""))}
        error={errors.includes("delta") ? copy.sessionsError : undefined}
        autoComplete="off"
      />
      <TextField
        label={copy.note}
        hint={copy.noteHint}
        maxLength={500}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        error={errors.includes("note") ? copy.noteError : undefined}
        autoComplete="off"
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** "Дозаписать занятие" (PRD 2.6.2-7): day, start, length and whether it took place. */
export function PastSessionForm({ coachingId, today, onDone }: { coachingId: string; today: string; onDone: () => void }) {
  const { t } = useI18n();
  const copy = t.money.passes.pastForm;
  const report = useReport();
  const [values, setValues] = useState({ day: today, time: "", duration: "60", status: "attended" as "attended" | "no_show" });
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await recordPastSession({
            coachingId,
            day: values.day,
            time: values.time,
            durationMin: Number.parseInt(values.duration, 10) || 0,
            status: values.status,
          });
          setErrors(result.status === "invalid" ? result.fields : []);
          const refused = result.status === "refused" && result.reason === "ended" ? copy.ended : copy.notPast;
          if (report(result, copy.done, refused)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <DateField label={copy.day} required max={today} value={values.day} onChange={(day) => setValues({ ...values, day })} />
      <TimeField
        label={copy.time}
        required
        value={values.time}
        onChange={(time) => setValues({ ...values, time })}
        error={errors.includes("time") ? copy.timeError : undefined}
      />
      <TextField
        label={copy.duration}
        inputMode="numeric"
        value={values.duration}
        onChange={(event) => setValues({ ...values, duration: event.target.value.replace(/\D/g, "") })}
        error={errors.includes("durationMin") ? copy.durationError : undefined}
        autoComplete="off"
      />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.status}
        </span>
        <SegmentedControl
          label={copy.status}
          value={values.status}
          onValueChange={(status) => setValues({ ...values, status })}
          options={[
            { value: "attended", label: copy.attended },
            { value: "no_show", label: copy.noShow },
          ]}
        />
      </div>
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** "Долг" of a client card: each session that went into debt, with "Простить". */
export function DebtCharges({
  charges,
  timeZone,
  onWaive,
}: {
  charges: DebtCharge[];
  timeZone: string;
  onWaive: ((target: WaiveTarget) => void) | null;
}) {
  const { t, locale } = useI18n();
  const copy = t.money.passes;
  return (
    <section aria-labelledby="pair-debt" className="flex flex-col gap-1.5">
      <h3 id="pair-debt" className="px-4 text-footnote text-ink-2">
        {copy.debt.title}
      </h3>
      <ul className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
        {charges.map((charge) => (
          <li key={charge.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
            <span className="flex min-w-0 flex-col">
              <span className="text-body">{copy.history.charge[charge.reason ?? "manual"]}</span>
              <span className="text-footnote text-ink-2">
                {[
                  formatNoteTime(locale, charge.at, timeZone),
                  charge.amountMinor > 0 && charge.currency ? formatMoney(locale, charge.amountMinor, charge.currency) : null,
                  charge.note,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </span>
            {onWaive ? (
              <Button size="sm" variant="ghost" onClick={() => onWaive({ chargeId: charge.id, passTitle: null })}>
                {copy.waive}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="px-4 text-footnote text-ink-2">{copy.debt.text}</p>
    </section>
  );
}
