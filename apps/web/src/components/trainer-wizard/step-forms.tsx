"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { TemplateFields } from "@/components/packages/template-fields";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { useHydrated } from "@/lib/use-hydrated";
import { saveWizardStep, type WizardState, type WizardValues } from "@/lib/trainer-wizard/actions";
import {
  CANCELLATION_HOURS,
  CURRENCIES,
  PAYMENT_LINK_KINDS,
  SPECIALTIES,
  type Currency,
  type PaymentLinkKind,
} from "@/lib/trainer-wizard/options";
import { nextPath, SKIPPABLE_STEPS, type WizardStep } from "@/lib/trainer-wizard/steps";
import { LocationList, type Place } from "./location-manager";

const IDLE: WizardState = { status: "idle" };

type StepFormProps = {
  step: WizardStep;
  /** "Добавить ещё" next to "Далее", for steps that collect a list. */
  addMore?: boolean;
  /** Opened from "Профиль тренера": "Сохранить" goes back there, with nothing to skip. */
  edit?: boolean;
  children: (state: { values: WizardValues | null; error: (field: string) => boolean }) => React.ReactNode;
};

/**
 * A step's form with its buttons: "Далее" saves and moves on, "Пропустить" moves on without saving.
 * React resets a form to its default values after the action runs, so a rejected form gets what was
 * sent as its defaults, and a saved one ("Добавить ещё") comes back empty.
 */
function StepForm({ step, addMore = false, edit = false, children }: StepFormProps) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveWizardStep, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;
  const fields = state.status === "invalid" ? state.fields : [];

  return (
    <form action={action} className="flex flex-1 flex-col gap-6" noValidate>
      <input type="hidden" name="step" value={step} />
      {edit ? <input type="hidden" name="mode" value="edit" /> : null}
      <div className="flex flex-col gap-5">{children({ values, error: (field) => fields.includes(field) })}</div>
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {t.trainerWizard.failed}
        </p>
      ) : null}
      <div className="mt-auto flex flex-col gap-3">
        <Button type="submit" size="lg" block loading={pending}>
          {edit ? t.trainerWizard.edit.save : t.trainerWizard.next}
        </Button>
        {addMore && !edit ? (
          <Button type="submit" name="intent" value="more" variant="secondary" size="lg" block disabled={pending}>
            {t.trainerWizard.addMore}
          </Button>
        ) : null}
        {SKIPPABLE_STEPS.has(step) && !edit ? (
          <Button asChild variant="ghost" size="lg" block>
            <Link href={nextPath(step)}>{t.trainerWizard.skip}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const value = (values: WizardValues | null, name: string, fallback: string) => {
  const sent = values?.[name];
  return typeof sent === "string" ? sent : fallback;
};

type EditProp = { edit?: boolean };

export function ProfileForm({
  name,
  photoUrl,
  headline,
  bio,
  edit,
}: { name: string; photoUrl: string | null; headline: string; bio: string } & EditProp) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.profile;
  return (
    <StepForm step="profile" edit={edit}>
      {({ values, error }) => (
        <>
          <PersonAvatar name={name} src={photoUrl} size={96} decorative />
          <TextField
            name="name"
            label={copy.name}
            defaultValue={value(values, "name", name)}
            error={error("name") ? copy.nameError : undefined}
            maxLength={64}
            autoComplete="name"
            required
          />
          <TextField
            name="headline"
            label={copy.headline}
            hint={copy.headlineHint}
            defaultValue={value(values, "headline", headline)}
            maxLength={120}
          />
          <TextArea name="bio" label={copy.bio} hint={copy.bioHint} defaultValue={value(values, "bio", bio)} maxLength={2000} />
        </>
      )}
    </StepForm>
  );
}

type FormatFormProps = { offline: boolean; online: boolean; specialties: string[]; city: string } & EditProp;

export function FormatForm({ offline, online, specialties, city, edit }: FormatFormProps) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.format;
  return (
    <StepForm step="format" edit={edit}>
      {({ values, error }) => {
        const sentSpecialties = values ? ((values.specialties as string[] | undefined) ?? []) : specialties;
        return (
          <>
            <fieldset className="flex flex-col gap-2" aria-describedby={error("format") ? "format-error" : undefined}>
              <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.formatLabel}</legend>
              <div className="flex flex-wrap gap-2">
                <ChipCheckbox name="offline" defaultChecked={values ? values.offline === "on" : offline}>
                  {copy.offline}
                </ChipCheckbox>
                <ChipCheckbox name="online" defaultChecked={values ? values.online === "on" : online}>
                  {copy.online}
                </ChipCheckbox>
              </div>
              {error("format") ? (
                <p id="format-error" className="px-1 text-footnote text-danger">
                  {copy.formatError}
                </p>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.specialtiesLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((key) => (
                  <ChipCheckbox key={key} name="specialties" value={key} defaultChecked={sentSpecialties.includes(key)}>
                    {t.trainerWizard.specialties[key]}
                  </ChipCheckbox>
                ))}
              </div>
            </fieldset>
            <TextField name="city" label={copy.city} hint={copy.cityHint} defaultValue={value(values, "city", city)} maxLength={80} />
          </>
        );
      }}
    </StepForm>
  );
}

/**
 * The places step: what was added so far, each with "Изменить" and "Удалить", above the form for a new
 * one. The list sits outside the step's form, since its own forms open in sheets.
 */
export function LocationsForm({ locations, onlineOnly }: { locations: Place[]; onlineOnly: boolean }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.locations;
  return (
    <>
      {onlineOnly ? <p className="text-callout text-ink-2">{copy.onlineOnly}</p> : null}
      {locations.length > 0 ? <LocationList header={copy.added} locations={locations} /> : null}
      <StepForm step="locations" addMore>
        {({ values, error }) => (
          <>
            <TextField
              name="name"
              label={copy.name}
              placeholder={copy.namePlaceholder}
              defaultValue={value(values, "name", "")}
              error={error("name") ? copy.nameError : undefined}
              maxLength={80}
              autoComplete="off"
            />
            <TextField
              name="address"
              label={copy.address}
              hint={copy.addressHint}
              defaultValue={value(values, "address", "")}
              maxLength={200}
              autoComplete="street-address"
            />
          </>
        )}
      </StepForm>
    </>
  );
}

type RegionFormProps = { timeZone: string; currency: string; zones: { id: string; label: string }[] } & EditProp;

export function RegionForm({ timeZone, currency, zones, edit }: RegionFormProps) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.region;
  return (
    <StepForm step="region" edit={edit}>
      {({ values, error }) => (
        <RegionFields
          zones={zones}
          initialZone={value(values, "timeZone", timeZone)}
          initialCurrency={value(values, "currency", currency)}
          zoneError={error("timeZone") ? copy.timeZoneError : undefined}
        />
      )}
    </StepForm>
  );
}

function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function RegionFields({
  zones,
  initialZone,
  initialCurrency,
  zoneError,
}: {
  zones: { id: string; label: string }[];
  initialZone: string;
  initialCurrency: string;
  zoneError?: string;
}) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.region;
  const hydrated = useHydrated();
  const select = useRef<HTMLSelectElement>(null);
  const [zone, setZone] = useState(initialZone);
  const [currency, setCurrency] = useState<Currency>(isCurrency(initialCurrency) ? initialCurrency : "RUB");
  // Only the browser knows its zone, so the hint appears after hydration.
  const deviceZone = hydrated ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const offerDevice = deviceZone !== null && deviceZone !== zone && zones.some((item) => item.id === deviceZone);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="time-zone" className="px-1 text-footnote text-ink-2">
          {copy.timeZone}
        </label>
        <select
          id="time-zone"
          name="timeZone"
          ref={select}
          defaultValue={initialZone}
          onChange={(event) => setZone(event.target.value)}
          aria-invalid={zoneError ? true : undefined}
          aria-describedby={zoneError ? "time-zone-error" : undefined}
          className="h-13 w-full rounded-sm border border-field-line bg-field px-4 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)] aria-invalid:border-danger"
        >
          {zones.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {zoneError ? (
          <p id="time-zone-error" className="px-1 text-footnote text-danger">
            {zoneError}
          </p>
        ) : null}
        {offerDevice ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              if (select.current) select.current.value = deviceZone;
              setZone(deviceZone);
            }}
          >
            {interpolate(copy.useDevice, { zone: deviceZone.replaceAll("_", " ") })}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.currency}
        </span>
        <input type="hidden" name="currency" value={currency} />
        <SegmentedControl
          label={copy.currency}
          options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          value={currency}
          onValueChange={setCurrency}
        />
      </div>
    </>
  );
}

export function CancellationForm({ hours, edit }: { hours: number } & EditProp) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.cancellation;
  const initial = (CANCELLATION_HOURS as readonly number[]).includes(hours) ? hours : 24;
  const [selected, setSelected] = useState(String(initial));
  return (
    <StepForm step="cancellation" edit={edit}>
      {() => (
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="px-1 text-footnote text-ink-2">
            {copy.label}
          </span>
          <input type="hidden" name="hours" value={selected} />
          <SegmentedControl
            label={copy.label}
            options={CANCELLATION_HOURS.map((option) => ({ value: String(option), label: interpolate(copy.hours, { hours: option }) }))}
            value={selected}
            onValueChange={setSelected}
          />
          <p className="px-1 text-footnote text-ink-2">{copy.hint}</p>
        </div>
      )}
    </StepForm>
  );
}

type PaymentLink = { id: string; title: string; url: string; kind: string };

export function PaymentForm({ links }: { links: PaymentLink[] }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.payment;
  return (
    <StepForm step="payment" addMore>
      {({ values, error }) => (
        <>
          {links.length > 0 ? (
            <ListGroup header={copy.added}>
              {links.map((link) => (
                <ListRow key={link.id} title={link.title} subtitle={link.url} />
              ))}
            </ListGroup>
          ) : null}
          <TextField
            name="title"
            label={copy.linkTitle}
            placeholder={copy.linkTitlePlaceholder}
            defaultValue={value(values, "title", "")}
            error={error("title") ? copy.linkTitleError : undefined}
            maxLength={64}
            autoComplete="off"
          />
          <TextField
            name="url"
            label={copy.url}
            placeholder="https://"
            defaultValue={value(values, "url", "")}
            error={error("url") ? copy.urlError : undefined}
            type="url"
            inputMode="url"
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
          />
          <KindField initial={value(values, "kind", "sbp")} />
        </>
      )}
    </StepForm>
  );
}

function isKind(value: string): value is PaymentLinkKind {
  return (PAYMENT_LINK_KINDS as readonly string[]).includes(value);
}

function KindField({ initial }: { initial: string }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.payment;
  const [kind, setKind] = useState<PaymentLinkKind>(isKind(initial) ? initial : "sbp");
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="px-1 text-footnote text-ink-2">
        {copy.kind}
      </span>
      <input type="hidden" name="kind" value={kind} />
      <SegmentedControl
        label={copy.kind}
        options={PAYMENT_LINK_KINDS.map((option) => ({ value: option, label: copy.kinds[option] }))}
        value={kind}
        onValueChange={setKind}
      />
    </div>
  );
}

/**
 * The price grid step: the template 1/5/10/20 in the trainer's currency (screens.md flow 4.1). A trainer who
 * already has packages changes them under "Деньги"; here "Далее" just moves on.
 */
export function PricesForm({ currency, symbol, hasPackages }: { currency: string; symbol: string; hasPackages: boolean }) {
  const { t } = useI18n();
  return (
    <StepForm step="prices">
      {({ values, error }) =>
        hasPackages ? (
          <>
            <input type="hidden" name="existing" value="1" />
            <p className="text-callout text-ink-2">{t.trainerWizard.steps.prices.existing}</p>
          </>
        ) : (
          <TemplateFields currency={currency} symbol={symbol} values={values} error={error} />
        )
      }
    </StepForm>
  );
}

/** The last step: documents go through the verification screen; "Позже" finishes the wizard. */
export function CertificatesForm({ uploadHref }: { uploadHref: string }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.certificates;
  const [state, action, pending] = useActionState(saveWizardStep, IDLE);
  return (
    <form action={action} className="mt-auto flex flex-col gap-3">
      <input type="hidden" name="step" value="certificates" />
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {t.trainerWizard.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.later}
      </Button>
      <Button asChild variant="secondary" size="lg" block>
        <Link href={uploadHref}>{copy.upload}</Link>
      </Button>
    </form>
  );
}
