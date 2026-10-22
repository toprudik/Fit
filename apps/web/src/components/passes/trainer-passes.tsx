"use client";

import { CalendarClock, History, Plus, Snowflake, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { DateField } from "@/components/ui/date-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate, plural } from "@/i18n/format";
import { addFreeze, cancelPass, changeExpiry, deletePass, endFreeze, removeFreeze } from "@/lib/passes/actions";
import { freezeOverlap } from "@/lib/passes/freeze-overlap";
import type { PairMoney, PassView } from "@/lib/passes/load";
import { formatLocalDay, freezeState, type Freeze } from "@/lib/passes/present";
import { AdjustForm, DebtCharges, PastSessionForm, WaiveForm, type WaiveTarget } from "./charge-forms";
import { MoneyChanges } from "./money-changes";
import { PassHistory, PassSummary } from "./pass-card";
import { SellPassForm } from "./sell-pass-form";
import { useReport } from "./use-report";

type Action =
  | { kind: "sell" | "past" }
  | { kind: "freeze" | "expiry" | "cancel" | "delete" | "adjust"; pass: PassView }
  | { kind: "waive"; target: WaiveTarget }
  | null;

function FreezeRow({ freeze, today, live }: { freeze: Freeze; today: string; live: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.money.passes.freezes;
  const report = useReport();
  const [pending, startTransition] = useTransition();
  const state = freezeState(freeze, today);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="text-subhead tabular-nums">
          {interpolate(copy.period, { from: formatLocalDay(locale, freeze.from), to: formatLocalDay(locale, freeze.to) })}
        </span>
        <span className="text-footnote text-ink-2">{[copy[state], freeze.reason].filter(Boolean).join(", ")}</span>
      </span>
      {live && state === "future" ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => startTransition(async () => void report(await removeFreeze(freeze.id), copy.removed))}
        >
          {copy.remove}
        </Button>
      ) : null}
      {live && state === "current" && freeze.to > today ? (
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => startTransition(async () => void report(await endFreeze({ freezeId: freeze.id, lastDay: today }), copy.ended))}
        >
          {copy.end}
        </Button>
      ) : null}
    </li>
  );
}

function FreezeForm({ pass, today, onDone }: { pass: PassView; today: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.passes.freezeForm;
  const report = useReport();
  const [values, setValues] = useState({ from: today, to: today, reason: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  // Confirmed sessions on the chosen days: they stay booked, but this pass will not pay for them (§2.8).
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    let current = true;
    if (values.to < values.from) return;
    freezeOverlap({ passId: pass.id, from: values.from, to: values.to })
      .then((count) => {
        if (current) setOverlap(count);
      })
      .catch(() => {
        if (current) setOverlap(0);
      });
    return () => {
      current = false;
    };
  }, [pass.id, values.from, values.to]);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addFreeze({ passId: pass.id, ...values });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (report(result, copy.done, copy.overlap)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <DateField label={copy.from} required value={values.from} onChange={(from) => setValues({ ...values, from })} />
      <DateField
        label={copy.to}
        required
        min={values.from}
        value={values.to}
        onChange={(to) => setValues({ ...values, to })}
        error={errors.includes("to") ? copy.toError : undefined}
      />
      {overlap > 0 && values.to >= values.from ? (
        <p role="status" className="rounded-sm bg-warning-soft p-3 text-subhead text-ink">
          {plural(locale, overlap, copy.bookings)}
        </p>
      ) : null}
      <TextField
        label={copy.reason}
        hint={copy.reasonHint}
        maxLength={500}
        value={values.reason}
        onChange={(event) => setValues({ ...values, reason: event.target.value })}
        autoComplete="off"
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

function ExpiryForm({ pass, onDone }: { pass: PassView; onDone: () => void }) {
  const { t } = useI18n();
  const copy = t.money.passes.expiryForm;
  const report = useReport();
  const [none, setNone] = useState(pass.baseLastDay === null);
  const [lastDay, setLastDay] = useState(pass.baseLastDay ?? pass.startsOn);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await changeExpiry({ passId: pass.id, lastDay: none ? null : lastDay, reason });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (report(result, copy.done, copy.range)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <Switch checked={none} onCheckedChange={setNone} label={copy.noExpiry} showLabel />
      {none ? null : (
        <DateField
          label={copy.lastDay}
          required
          min={pass.startsOn}
          value={lastDay}
          onChange={setLastDay}
          error={errors.includes("lastDay") ? copy.dayError : undefined}
        />
      )}
      <TextField
        label={copy.reason}
        hint={copy.reasonHint}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={errors.includes("reason") ? copy.reasonError : undefined}
        autoComplete="off"
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

function CancelForm({ pass, onDone }: { pass: PassView; onDone: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.passes.cancelForm;
  const report = useReport();
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await cancelPass({ passId: pass.id, reason });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (report(result, copy.done)) onDone();
        });
      }}
    >
      <p className="text-subhead text-ink-2">{interpolate(copy.text, { left: plural(locale, pass.remaining, t.pairs.debtSessions) })}</p>
      <TextField
        label={copy.reason}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={errors.includes("reason") ? copy.reasonError : undefined}
        autoComplete="off"
      />
      <Button type="submit" variant="destructive" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/**
 * "Абонементы" of a client card (screens.md): every pass with its balance, dates, payments, freezes and history,
 * "Оформить абонемент", and per pass "Заморозить", "Изменить срок", "Аннулировать" or "Удалить" (PRD 2.8-8, 14, 16).
 */
export function TrainerPasses({ money, symbol }: { money: PairMoney; symbol: string }) {
  const { t } = useI18n();
  const copy = t.money.passes;
  const report = useReport();
  const [action, setAction] = useState<Action>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => setAction(null), []);
  const live = money.status !== "ended";

  const titles = {
    sell: copy.sellForm.title,
    past: copy.pastForm.title,
    freeze: copy.freezeForm.title,
    expiry: copy.expiryForm.title,
    cancel: copy.cancelForm.title,
    delete: copy.deleteForm.title,
    adjust: copy.adjustForm.title,
    waive: copy.waiveForm.title,
  };
  const sheetTitle = titles[action?.kind ?? "delete"];
  const waive = (target: WaiveTarget) => setAction({ kind: "waive", target });

  return (
    <div className="flex flex-col gap-4">
      {live ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" block icon={Plus} onClick={() => setAction({ kind: "sell" })}>
            {copy.sell}
          </Button>
          <Button size="lg" block variant="secondary" icon={History} onClick={() => setAction({ kind: "past" })}>
            {copy.recordPast}
          </Button>
        </div>
      ) : null}

      {money.debtCharges.length ? <DebtCharges charges={money.debtCharges} timeZone={money.timeZone} onWaive={waive} /> : null}

      {money.passes.length === 0 ? <EmptyState icon={CalendarClock} title={copy.empty} description={live ? copy.emptyText : undefined} /> : null}

      <ul className="flex flex-col gap-3">
        {money.passes.map((pass) => {
          const open = pass.status !== "cancelled";
          return (
            <li key={pass.id} className="flex flex-col gap-3">
              <PassSummary pass={pass}>
                {pass.freezes.length ? (
                  <section className="flex flex-col gap-1.5">
                    <h4 className="text-footnote text-ink-2">{copy.freezes.title}</h4>
                    <ul className="flex flex-col gap-1.5">
                      {pass.freezes.map((freeze) => (
                        <FreezeRow key={freeze.id} freeze={freeze} today={money.today} live={open} />
                      ))}
                    </ul>
                  </section>
                ) : null}
                {open ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={Snowflake} onClick={() => setAction({ kind: "freeze", pass })}>
                      {copy.freeze}
                    </Button>
                    <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setAction({ kind: "expiry", pass })}>
                      {copy.expiry}
                    </Button>
                    <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setAction({ kind: "adjust", pass })}>
                      {copy.adjust}
                    </Button>
                    {pass.deletable ? (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setAction({ kind: "delete", pass })}>
                        {copy.delete}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setAction({ kind: "cancel", pass })}>
                        {copy.cancel}
                      </Button>
                    )}
                  </div>
                ) : null}
              </PassSummary>
              {pass.history.length ? (
                <PassHistory
                  entries={pass.history}
                  timeZone={money.timeZone}
                  onWaive={(chargeId) => waive({ chargeId, passTitle: pass.title })}
                />
              ) : null}
              <MoneyChanges changes={pass.changes} timeZone={money.timeZone} />
            </li>
          );
        })}
      </ul>

      <Sheet
        open={action !== null && action.kind !== "delete"}
        onOpenChange={(next) => (next ? null : close())}
        title={sheetTitle}
      >
        {action?.kind === "sell" ? (
          <SellPassForm
            coachingId={money.coachingId}
            packages={money.packages}
            symbol={symbol}
            today={money.today}
            debtSessions={money.debt.sessions}
            onDone={close}
          />
        ) : action?.kind === "freeze" ? (
          <FreezeForm key={action.pass.id} pass={action.pass} today={money.today} onDone={close} />
        ) : action?.kind === "expiry" ? (
          <ExpiryForm key={action.pass.id} pass={action.pass} onDone={close} />
        ) : action?.kind === "cancel" ? (
          <CancelForm key={action.pass.id} pass={action.pass} onDone={close} />
        ) : action?.kind === "adjust" ? (
          <AdjustForm key={action.pass.id} pass={action.pass} onDone={close} />
        ) : action?.kind === "waive" ? (
          <WaiveForm key={action.target.chargeId} target={action.target} onDone={close} />
        ) : action?.kind === "past" ? (
          <PastSessionForm coachingId={money.coachingId} today={money.today} onDone={close} />
        ) : null}
      </Sheet>

      <Sheet
        open={action?.kind === "delete"}
        onOpenChange={(next) => (next ? null : close())}
        title={copy.deleteForm.title}
        description={copy.deleteForm.text}
        actions={
          <>
            <Button
              variant="destructive"
              size="lg"
              block
              loading={pending}
              onClick={() =>
                action?.kind === "delete" &&
                startTransition(async () => {
                  if (report(await deletePass(action.pass.id), copy.deleteForm.done, copy.deleteForm.inUse)) close();
                })
              }
            >
              {copy.deleteForm.submit}
            </Button>
            <Button variant="ghost" size="lg" block onClick={close}>
              {copy.back}
            </Button>
          </>
        }
      />
    </div>
  );
}
