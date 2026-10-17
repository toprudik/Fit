import type { Metadata } from "next";
import { Suspense } from "react";
import { PhotoEditor } from "@/components/progress/photo-editor";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { Camera } from "lucide-react";
import { isDay } from "@/lib/passes/present";
import { loadMyPhotos } from "@/lib/progress/photo-load";
import { isPhotoAngle, PHOTO_ANGLES } from "@/lib/progress/photos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.progress.photos.newTitle };
}

async function Editor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, search, photos] = await Promise.all([getDictionary(), searchParams, loadMyPhotos()]);
  if (!photos) return <EmptyState icon={Camera} title={t.progress.photos.signedOut} />;
  const angle = isPhotoAngle(search.angle) ? search.angle : "front";
  const date = isDay(search.date) && search.date <= photos.today ? search.date : photos.today;
  const taken = photos.sets.flatMap((set) => PHOTO_ANGLES.filter((option) => set.photos[option]).map((option) => `${set.date}:${option}`));
  return <PhotoEditor today={photos.today} angle={angle} date={date} taken={taken} />;
}

/** "Новое фото": `?angle=&date=` preselect a missing angle or a retake from the gallery. */
export default async function NewPhotoPage(props: PageProps<"/[lang]/client/progress/photos/new">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.progress.photos.newTitle} back={{ fallbackHref: "/client/progress/photos" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <Editor searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
