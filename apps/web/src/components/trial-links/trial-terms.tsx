import { Banknote, Clock, MapPin, Video } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { formatTrialPrice } from "@/lib/trial-links/link";

export type TrialTermsData = {
  title: string;
  description: string | null;
  durationMin: number;
  priceMinor: number;
  currency: string;
  mode: "offline" | "online" | null;
  locationName: string | null;
  locationAddress: string | null;
};

/** The trial as the trainer set it up: name, what happens, length, price or "free", and where. */
export function TrialTerms({ t, locale, trial }: { t: Dictionary; locale: Locale; trial: TrialTermsData }) {
  const copy = t.trialLinks.landing;
  const place =
    trial.mode === "online"
      ? { icon: Video, title: copy.online, subtitle: undefined }
      : trial.locationName
        ? { icon: MapPin, title: trial.locationName, subtitle: trial.locationAddress ?? undefined }
        : trial.mode === "offline"
          ? { icon: MapPin, title: copy.offline, subtitle: undefined }
          : null;
  return (
    <ListGroup header={trial.title} footer={trial.description ? <p className="whitespace-pre-line">{trial.description}</p> : undefined}>
      <ListRow icon={Clock} title={interpolate(copy.minutes, { minutes: trial.durationMin })} />
      <ListRow
        icon={Banknote}
        title={trial.priceMinor === 0 ? copy.free : formatTrialPrice(locale, trial.priceMinor, trial.currency)}
      />
      {place ? <ListRow icon={place.icon} title={place.title} subtitle={place.subtitle} /> : null}
    </ListGroup>
  );
}
