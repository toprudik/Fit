"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { givePublicConsent } from "@/lib/public-data/actions";
import {
  CONDITION_MAX,
  conditionText,
  FIELD_CHIPS,
  PUBLIC_BANS,
  type PublicConsent,
  type PublicPlace,
  type PublicScope,
} from "@/lib/public-data/consent";

/**
 * "Согласие на публикацию" (152-FZ art. 10.1): a separate sheet, nothing preselected for a first consent, so silence
 * is never consent. For the showcase the trainer picks the fields; for story cards only bans and a condition, since
 * each card shows what the person picks for it. Places are listed with their addresses and ticked one by one, so the
 * trainer sees what goes public and can leave a home address out. `initial` is the consent in force, when changing it.
 */
export function PublicConsentSheet({
  scope,
  open,
  onOpenChange,
  initial,
  places = [],
  onDone,
}: {
  scope: PublicScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: PublicConsent | null;
  /** The trainer's places in use, for the showcase. */
  places?: readonly PublicPlace[];
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const copy = t.publicData;
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const showcase = scope === "showcase";

  function submit(formData: FormData) {
    const condition = conditionText(String(formData.get("condition") ?? ""));
    setError(condition === "long" ? copy.conditionLong : undefined);
    if (condition === "long") return;
    startTransition(async () => {
      const { status } = await givePublicConsent({
        scope,
        fields: formData.getAll("fields").map(String),
        bans: formData.getAll("bans").map(String),
        condition,
        ...(showcase ? { locationIds: formData.getAll("locations").map(String) } : {}),
      });
      if (status === "done") {
        onOpenChange(false);
        toast.success(showcase ? copy.done.showcase : copy.done.story);
        onDone?.();
      } else toast.error(copy.failed);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={copy.title}
      description={showcase ? copy.showcaseText : copy.storyText}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        {showcase ? (
          <fieldset>
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.fieldsLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {FIELD_CHIPS.map((field) => (
                <ChipCheckbox key={field} name="fields" value={field} defaultChecked={initial?.fields.includes(field)}>
                  {copy.fields[field]}
                </ChipCheckbox>
              ))}
            </div>
            <p className="mt-2 px-1 text-footnote text-ink-2">{copy.nameAlways}</p>
          </fieldset>
        ) : null}
        {showcase && places.length > 0 ? (
          <fieldset>
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.fields.locations}</legend>
            <div className="flex flex-col gap-2">
              {places.map((place) => (
                <label key={place.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md bg-surface-2 px-4 py-3">
                  <input
                    type="checkbox"
                    name="locations"
                    value={place.id}
                    defaultChecked={initial?.locationIds.includes(place.id)}
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-inverse"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-subhead font-medium break-words">{place.name}</span>
                    {place.address ? <span className="text-footnote break-words text-ink-2">{place.address}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 px-1 text-footnote text-ink-2">{copy.locationsHint}</p>
          </fieldset>
        ) : null}
        <fieldset>
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.bansLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_BANS.map((ban) => (
              <ChipCheckbox key={ban} name="bans" value={ban} defaultChecked={initial?.bans.includes(ban)}>
                {copy.bans[ban]}
              </ChipCheckbox>
            ))}
          </div>
          <p className="mt-2 px-1 text-footnote text-ink-2">{copy.bansHint}</p>
        </fieldset>
        <TextArea
          name="condition"
          label={copy.condition}
          hint={copy.conditionHint}
          error={error}
          defaultValue={initial?.condition ?? undefined}
          maxLength={CONDITION_MAX + 50}
          rows={3}
        />
        <p className="px-1 text-footnote text-ink-2">
          {copy.documentLead}{" "}
          <Link href={copy.documentHref} className="text-accent underline underline-offset-2">
            {copy.document}
          </Link>
        </p>
        <Button type="submit" size="lg" block loading={pending}>
          {copy.give}
        </Button>
      </form>
    </Sheet>
  );
}
