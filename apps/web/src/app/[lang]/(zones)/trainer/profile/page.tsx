import type { Metadata } from "next";
import { Clock, Dumbbell, Globe, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadWizard, type WizardData } from "@/lib/trainer-wizard/load";
import { isSpecialty } from "@/lib/trainer-wizard/options";
import { editPath, PROFILE_EDIT_PATH } from "@/lib/trainer-wizard/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerWizard.edit.title };
}

/** "В зале и онлайн · Силовые, Йога": the format and directions as the showcase shows them. */
function formatSummary(t: Dictionary, trainer: NonNullable<WizardData>["trainer"]): string {
  const formats = t.trainerWizard.done.formats;
  const format = trainer.works_offline && trainer.works_online ? formats.both : trainer.works_online ? formats.online : formats.offline;
  const specialties = trainer.specialties.filter(isSpecialty).map((key) => t.trainerWizard.specialties[key]);
  return [format, specialties.join(", ")].filter(Boolean).join(" · ");
}

async function Sections() {
  const [t, wizard] = await Promise.all([getDictionary(), loadWizard()]);
  const copy = t.trainerWizard.edit;
  if (wizard.status === "signed-out") {
    return (
      <EmptyState
        icon={UserRound}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(PROFILE_EDIT_PATH)}`}>{t.trainerWizard.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (wizard.status === "not-trainer") return <EmptyState icon={UserRound} title={copy.title} description={copy.notTrainer} />;

  const { data } = wizard;
  const steps = t.trainerWizard.steps;
  const places = data.locations.map((place) => place.name).join(", ");
  return (
    <ListGroup>
      <ListRow
        icon={UserRound}
        iconTone="accent"
        title={data.name || copy.notSet}
        subtitle={data.trainer.headline ?? steps.profile.headline}
        href={editPath("profile")}
      />
      <ListRow icon={Dumbbell} title={steps.format.title} subtitle={formatSummary(t, data.trainer)} href={editPath("format")} />
      <ListRow icon={MapPin} title={steps.locations.title} subtitle={places || copy.noLocations} href={editPath("locations")} />
      <ListRow
        icon={Globe}
        title={steps.region.title}
        subtitle={`${data.timeZone.replaceAll("_", " ")} · ${data.trainer.default_currency}`}
        href={editPath("region")}
      />
      <ListRow
        icon={Clock}
        title={steps.cancellation.title}
        subtitle={interpolate(copy.cancellation, {
          hours: data.trainer.cancellation_deadline_hours,
          notice: Math.round(data.trainer.min_booking_notice_minutes / 60),
        })}
        href={editPath("cancellation")}
      />
    </ListGroup>
  );
}

/**
 * "Профиль тренера" in the trainer zone (PRD wave-1 §2.3, §2.6.5, §2.6.7): what the trainer filled in
 * the wizard, one row per section, each opening that step's form to change it.
 */
export default async function TrainerProfilePage() {
  const t = await getDictionary();
  const copy = t.trainerWizard.edit;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Sections />
        </Suspense>
      </div>
    </Screen>
  );
}
