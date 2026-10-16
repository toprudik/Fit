"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { createTrialLink, type CreateTrialLinkState } from "@/lib/trial-links/actions";
import { TRIAL_DURATIONS } from "@/lib/trial-links/link";

const IDLE: CreateTrialLinkState = { status: "idle" };

type Mode = "offline" | "online";

const SELECT_CLASS =
  "h-13 w-full rounded-sm border border-field-line bg-field px-4 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]";

/**
 * "Новая ссылка на пробное": name, what happens, length, price in the trainer's currency (0 = free),
 * format and, in person, the place. React resets the form after its action, so a rejected form gets
 * what was typed back as its defaults and a created one starts empty.
 */
export function TrialLinkForm({
  currency,
  defaultMode,
  locations,
}: {
  /** "₽", shown after the price. */
  currency: string;
  defaultMode: Mode;
  locations: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const copy = t.trialLinks.trainer.create;
  const [state, action, pending] = useActionState(createTrialLink, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;
  const invalid = (field: string) => state.status === "invalid" && state.fields.includes(field);
  const [mode, setMode] = useState<Mode>(defaultMode);

  useEffect(() => {
    if (state.status === "created") toast.success(copy.created);
  }, [state, copy.created]);

  return (
    <section aria-labelledby="new-trial-link" className="flex flex-col gap-3">
      <h3 id="new-trial-link" className="px-1 text-headline">
        {copy.header}
      </h3>
      <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <TextField
          label={copy.titleLabel}
          name="title"
          placeholder={copy.titlePlaceholder}
          defaultValue={values?.title ?? ""}
          maxLength={120}
          error={invalid("title") ? copy.titleError : undefined}
        />
        <TextArea label={copy.description} name="description" hint={copy.descriptionHint} defaultValue={values?.description ?? ""} maxLength={2000} rows={3} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trial-duration" className="px-1 text-footnote text-ink-2">
            {copy.duration}
          </label>
          <select id="trial-duration" name="duration" defaultValue={values?.duration ?? "60"} className={SELECT_CLASS}>
            {TRIAL_DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {interpolate(t.trialLinks.landing.minutes, { minutes })}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label={copy.price}
          name="price"
          inputMode="decimal"
          defaultValue={values?.price ?? "0"}
          suffix={currency}
          hint={copy.priceHint}
          error={invalid("price") ? copy.priceError : undefined}
        />
        <div className="flex flex-col gap-1.5">
          <span id="trial-format" className="px-1 text-footnote text-ink-2">
            {copy.format}
          </span>
          <input type="hidden" name="mode" value={mode} />
          <SegmentedControl
            label={copy.format}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "offline", label: t.trialLinks.landing.offline },
              { value: "online", label: t.trialLinks.landing.online },
            ]}
          />
        </div>
        {mode === "offline" && locations.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="trial-location" className="px-1 text-footnote text-ink-2">
              {copy.location}
            </label>
            <select id="trial-location" name="location" defaultValue={values?.location ?? ""} className={SELECT_CLASS}>
              <option value="">{copy.anyLocation}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {state.status === "failed" ? (
          <p role="alert" className="text-subhead text-danger">
            {copy.failed}
          </p>
        ) : null}
        <Button type="submit" size="lg" block loading={pending}>
          {copy.submit}
        </Button>
      </form>
    </section>
  );
}
