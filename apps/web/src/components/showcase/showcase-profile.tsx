import { BadgeCheck, MapPin } from "lucide-react";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Showcase } from "@/lib/showcase/load";
import { isSpecialty } from "@/lib/trainer-wizard/options";

/**
 * The public part of a showcase (PRD wave-1 §2.3 rule 1): photo, name, verification badge, headline,
 * format and city, specialties, about and locations. Prices join with packages in wave 2. Only what
 * get_trainer_showcase returns, so nothing private can show up here (SHOP-7).
 */
export function ShowcaseProfile({ t, showcase }: { t: Dictionary; showcase: Showcase }) {
  const copy = t.showcase.public;
  const name = showcase.name ?? copy.title;
  const format = [showcase.worksOffline ? copy.offline : null, showcase.worksOnline ? copy.online : null, showcase.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <PersonAvatar name={name} src={showcase.photoUrl} size={96} decorative />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-title-1 break-words">{name}</h1>
          {showcase.verified ? (
            <Badge tone="success" icon={BadgeCheck}>
              {copy.verified}
            </Badge>
          ) : null}
          {showcase.headline ? <p className="text-callout">{showcase.headline}</p> : null}
          {format ? <p className="text-subhead text-ink-2">{format}</p> : null}
        </div>
      </header>

      {showcase.specialties.length > 0 ? (
        <section aria-labelledby="showcase-specialties" className="flex flex-col gap-2">
          <h2 id="showcase-specialties" className="px-4 text-footnote text-ink-2">
            {copy.specialties}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {showcase.specialties.map((key) => (
              <li key={key} className="rounded-full bg-surface-2 px-3 py-1 text-footnote">
                {isSpecialty(key) ? t.trainerWizard.specialties[key] : key}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showcase.bio ? (
        <section aria-labelledby="showcase-about" className="flex flex-col gap-1.5">
          <h2 id="showcase-about" className="px-4 text-footnote text-ink-2">
            {copy.about}
          </h2>
          <p className="rounded-lg bg-surface-1 p-4 text-body break-words whitespace-pre-line">{showcase.bio}</p>
        </section>
      ) : null}

      {showcase.locations.length > 0 ? (
        <ListGroup header={copy.locations}>
          {showcase.locations.map((location, index) => (
            <ListRow key={`${location.name}-${index}`} icon={MapPin} title={location.name} subtitle={location.address ?? undefined} />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}
