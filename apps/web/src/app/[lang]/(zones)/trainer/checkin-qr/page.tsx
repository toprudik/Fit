import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { Suspense } from "react";
import { PlaceQrList } from "@/components/check-in/place-qr-list";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadScheduleOwner } from "@/lib/schedule/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.checkIn.placesTitle };
}

/** Reads the session, so it sits behind Suspense. */
async function Places() {
  const t = await getDictionary();
  const copy = t.checkIn;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.placesTitle} next="/trainer/checkin-qr" />;
  const { data, error } = await owner.supabase
    .from("locations")
    .select("id, name, address")
    .eq("trainer_id", owner.userId)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(`loading the locations failed: ${error.code}`);
  if (data.length === 0) return <EmptyState icon={MapPin} title={copy.placesEmptyTitle} description={copy.placesEmptyText} />;
  return <PlaceQrList places={data} />;
}

/** "QR для зала" (PRD wave-3 §5 rule 2b): a printed QR per location that checks clients in to their nearest session there. */
export default async function PlaceQrPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.checkIn.placesTitle} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <Places />
        </Suspense>
      </div>
    </Screen>
  );
}
