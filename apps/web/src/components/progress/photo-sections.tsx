import { Camera, EyeOff, ImagePlus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { datesByAngle, loadMyPhotos, loadPairPhotos } from "@/lib/progress/photo-load";
import { PHOTO_ANGLES } from "@/lib/progress/photos";
import { PhotoGrid } from "./photo-grid";

function AddPhotoLink({ label, primary = true }: { label: string; primary?: boolean }) {
  return (
    <Link href="/client/progress/photos/new" className={buttonVariants({ variant: primary ? "primary" : "secondary" })}>
      <ImagePlus aria-hidden size={20} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

/**
 * The client's progress photos: the latest set on "Прогресс", every set on "Фото прогресса", with who else
 * sees them and the way to "До и после" once an angle has two dates.
 */
export async function ClientPhotos({ full = false }: { full?: boolean }) {
  const [t, photos] = await Promise.all([getDictionary(), loadMyPhotos()]);
  const copy = t.progress.photos;
  if (!photos) return <EmptyState icon={Camera} title={copy.signedOut} />;
  if (!photos.sets.length) {
    return (
      <EmptyState icon={Camera} title={copy.emptyTitle} description={copy.emptyText} action={<AddPhotoLink label={copy.add} />} headingLevel={full ? 2 : 3} />
    );
  }
  const dates = datesByAngle(photos.sets);
  const comparable = PHOTO_ANGLES.some((angle) => dates[angle].length >= 2);
  const viewers = photos.viewers.map((name) => name || copy.unnamedTrainer);
  return (
    <section className="flex flex-col gap-3" aria-label={copy.title}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        {full ? null : <h2 className="text-headline">{copy.title}</h2>}
        <AddPhotoLink label={copy.add} primary={full} />
      </div>
      <p className="px-4 text-footnote text-ink-2">{viewers.length ? interpolate(copy.seenBy, { names: viewers.join(", ") }) : copy.onlyYou}</p>
      <PhotoGrid sets={full ? photos.sets : photos.sets.slice(0, 1)} today={photos.today} editable />
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4">
        {comparable ? (
          <Link href="/client/progress/compare" className="text-footnote font-semibold text-accent-ink">
            {copy.compare}
          </Link>
        ) : null}
        {!full ? (
          <Link href="/client/progress/photos" className="text-footnote font-semibold text-accent-ink">
            {copy.all}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Photos on the trainer's card: shown only while the client shares them (Q38); otherwise one quiet line. */
export async function TrainerPhotos({ coachingId }: { coachingId: string }) {
  const [t, photos] = await Promise.all([getDictionary(), loadPairPhotos(coachingId)]);
  const copy = t.progress.photos;
  if (!photos) return null;
  if (photos.state === "closed") return <EmptyState icon={EyeOff} title={copy.closedTitle} description={copy.closedText} />;
  return (
    <section className="flex flex-col gap-3" aria-label={copy.title}>
      <h2 className="px-4 text-headline">{copy.title}</h2>
      {photos.sets.length ? (
        <PhotoGrid sets={photos.sets} today={photos.today} editable={false} />
      ) : (
        <p className="px-4 text-subhead text-ink-2">{copy.trainerEmpty}</p>
      )}
    </section>
  );
}
