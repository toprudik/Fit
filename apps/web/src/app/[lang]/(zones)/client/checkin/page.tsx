import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckInRun } from "@/components/check-in/check-in-run";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { placeCheckInPath } from "@/lib/check-in/link";
import { loadScheduleOwner } from "@/lib/schedule/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.checkIn.title };
}

type Props = PageProps<"/[lang]/client/checkin">;

async function PlaceCheckIn({ searchParams }: Pick<Props, "searchParams">) {
  const [t, query] = await Promise.all([getDictionary(), searchParams]);
  const place = typeof query.place === "string" ? query.place : "";
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={t.checkIn.title} next={placeCheckInPath(place)} />;
  return <CheckInRun target={{ place }} timeZone={owner.timeZone} />;
}

/** "Отметка на занятии" by the printed QR of a location (PRD wave-3 §5 rule 2b). */
export default async function PlaceCheckInPage(props: Props) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.checkIn.title} back={{ fallbackHref: "/client/sessions" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <PlaceCheckIn searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
