import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientPhotos } from "@/components/progress/photo-sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.progress.photos.title };
}

/** "Фото прогресса": sets by date and angle, who sees them, retake and delete (PRD wave-1 §2.11-3..7). */
export default async function ClientPhotosPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.progress.photos.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ClientPhotos full />
        </Suspense>
      </div>
    </Screen>
  );
}
