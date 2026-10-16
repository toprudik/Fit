import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/avatar";
import type { Dictionary } from "@/i18n/dictionaries";
import { personName } from "@/lib/client-links/link";
import { isSpecialty } from "@/lib/trainer-wizard/options";

export type TrainerPreview = {
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  headline: string | null;
  specialties: string[];
  worksOffline: boolean;
  worksOnline: boolean;
  verified: boolean;
};

/**
 * The trainer a link or code leads to (screens.md §3.1 "Лендинг ссылки клиента"): photo, name,
 * verification badge, headline, specialties and format. Nothing private: resolve_client_invite
 * returns only these fields.
 */
export function TrainerCard({ t, trainer }: { t: Dictionary; trainer: TrainerPreview }) {
  const copy = t.clientLinks.landing;
  const name = personName(trainer.firstName, trainer.lastName);
  const format = [trainer.worksOffline ? copy.offline : null, trainer.worksOnline ? copy.online : null].filter(Boolean).join(", ");
  // The profile wizard stores specialties as keys, so each viewer reads them in their own language.
  const specialties = trainer.specialties.map((key) => (isSpecialty(key) ? t.trainerWizard.specialties[key] : key));
  const details = [specialties.join(", "), format].filter(Boolean);

  return (
    <section aria-label={name || copy.title} className="flex items-start gap-4 rounded-lg bg-surface-1 p-4">
      <PersonAvatar name={name} src={trainer.photoUrl} size={64} decorative />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-title-3 break-words">{name || copy.title}</h2>
          {trainer.verified ? (
            <Badge tone="success" icon={BadgeCheck}>
              {copy.verified}
            </Badge>
          ) : null}
        </div>
        {trainer.headline ? <p className="text-subhead">{trainer.headline}</p> : null}
        {details.map((line) => (
          <p key={line} className="text-footnote text-ink-2">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
