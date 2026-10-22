import type { Locale } from "@/i18n/config";
import { currencySymbol } from "@/lib/money/format";
import type { WizardData } from "@/lib/trainer-wizard/load";
import { timeZones } from "@/lib/trainer-wizard/options";
import type { WizardStep } from "@/lib/trainer-wizard/steps";
import { LocationList } from "./location-manager";
import { CancellationForm, CertificatesForm, FormatForm, LocationsForm, PaymentForm, PricesForm, ProfileForm, RegionForm } from "./step-forms";

/** Where the last step sends documents: the verification screen (built with trainer verification). */
const CERTIFICATES_PATH = "/trainer/verification";

export type ZoneOption = {
  id: string;
  /** "Europe/Moscow", as the runtime names it. */
  label: string;
  /** "GMT+3" now, or "" when the runtime does not know the zone. */
  offset: string;
  /** The zone's name in the viewer's language, "Москва" or "Центральная Европа"; "" when there is none. */
  name: string;
};

/** "Москва, стандартное время" and "Moscow Standard Time" as "Москва" and "Moscow". */
function zoneName(locale: Locale, id: string, now: Date): string {
  const name = new Intl.DateTimeFormat(locale, { timeZone: id, timeZoneName: "longGeneric" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  if (!name || /^GMT/.test(name)) return "";
  return name
    .replace(/,? стандартное время$/, "")
    .replace(/ (Standard )?Time$/, "")
    .trim();
}

/**
 * The zones the trainer can pick, sorted as the runtime lists them, with the offset and a name to search by. A saved
 * zone the list lacks (Etc/GMT-3 from a client's device, Europe/Kyiv on an older runtime) comes first, so
 * "Сохранить" does not silently replace it.
 */
export function zoneOptions(saved: string | null | undefined, locale: Locale): ZoneOption[] {
  const now = new Date();
  const listed = timeZones();
  const ids = saved && !listed.includes(saved) ? [saved, ...listed] : listed;
  return ids.map((id) => {
    let offset = "";
    let name = "";
    try {
      offset =
        new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" })
          .formatToParts(now)
          .find((part) => part.type === "timeZoneName")?.value ?? "";
      name = zoneName(locale, id, now);
    } catch {
      // A zone this runtime does not know still shows by its id.
    }
    return { id, label: id.replaceAll("_", " "), offset, name };
  });
}

type StepFieldsProps = {
  step: WizardStep;
  data: NonNullable<WizardData>;
  locale: Locale;
  /** On "Профиль тренера": "Сохранить" returns there, and places are edited in a list with "Добавить место". */
  edit?: boolean;
};

/** One step's form filled with the trainer's saved answers, for the wizard and for "Профиль тренера". */
export function StepFields({ step, data, locale, edit = false }: StepFieldsProps) {
  return <StepForms key={JSON.stringify(data)} step={step} data={data} locale={locale} edit={edit} />;
}

/**
 * Keyed by the saved answers in StepFields: "Назад" brings a step back with the form state it was left in (and
 * React resets a submitted form to the defaults it rendered with), so a step whose answers changed since starts
 * over from them. Otherwise "Далее" there writes the old, often empty, values back (QA B3).
 */
function StepForms({ step, data, locale, edit = false }: StepFieldsProps) {
  const { trainer } = data;
  switch (step) {
    case "profile":
      return <ProfileForm name={data.name} photoUrl={data.photoUrl} headline={trainer.headline ?? ""} bio={trainer.bio ?? ""} edit={edit} />;
    case "format":
      return (
        <FormatForm
          offline={trainer.works_offline}
          online={trainer.works_online}
          specialties={trainer.specialties}
          city={trainer.city ?? ""}
          edit={edit}
        />
      );
    case "locations":
      return edit ? <LocationList locations={data.locations} canAdd /> : <LocationsForm locations={data.locations} onlineOnly={!trainer.works_offline} />;
    case "region":
      return <RegionForm timeZone={data.timeZone} currency={trainer.default_currency} zones={zoneOptions(data.timeZone, locale)} edit={edit} />;
    case "cancellation":
      return <CancellationForm hours={trainer.cancellation_deadline_hours} noticeMinutes={trainer.min_booking_notice_minutes} edit={edit} />;
    case "payment":
      return <PaymentForm links={data.paymentLinks} />;
    case "prices":
      return <PricesForm currency={trainer.default_currency} symbol={currencySymbol(locale, trainer.default_currency)} hasPackages={data.packageCount > 0} />;
    case "certificates":
      return <CertificatesForm uploadHref={CERTIFICATES_PATH} />;
  }
}
