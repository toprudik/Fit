import type { Locale } from "@/i18n/config";
import { currencySymbol } from "@/lib/money/format";
import type { WizardData } from "@/lib/trainer-wizard/load";
import { timeZones } from "@/lib/trainer-wizard/options";
import type { WizardStep } from "@/lib/trainer-wizard/steps";
import { LocationList } from "./location-manager";
import { CancellationForm, CertificatesForm, FormatForm, LocationsForm, PaymentForm, PricesForm, ProfileForm, RegionForm } from "./step-forms";

/** Where the last step sends documents: the verification screen (built with trainer verification). */
const CERTIFICATES_PATH = "/trainer/verification";

/** "Europe/Moscow (GMT+3)", sorted as the runtime lists them. */
function zoneOptions(): { id: string; label: string }[] {
  const now = new Date();
  return timeZones().map((id) => {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return { id, label: `${id.replaceAll("_", " ")}${offset ? ` (${offset})` : ""}` };
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
      return <RegionForm timeZone={data.timeZone} currency={trainer.default_currency} zones={zoneOptions()} edit={edit} />;
    case "cancellation":
      return <CancellationForm hours={trainer.cancellation_deadline_hours} edit={edit} />;
    case "payment":
      return <PaymentForm links={data.paymentLinks} />;
    case "prices":
      return <PricesForm currency={trainer.default_currency} symbol={currencySymbol(locale, trainer.default_currency)} hasPackages={data.packageCount > 0} />;
    case "certificates":
      return <CertificatesForm uploadHref={CERTIFICATES_PATH} />;
  }
}
