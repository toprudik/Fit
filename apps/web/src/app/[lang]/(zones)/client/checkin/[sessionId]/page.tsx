import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckInRun } from "@/components/check-in/check-in-run";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { checkInPath } from "@/lib/check-in/link";
import { loadScheduleOwner } from "@/lib/schedule/load";

// The session and code are known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.checkIn.title };
}

type Props = PageProps<"/[lang]/client/checkin/[sessionId]">;

async function CheckIn({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [t, { sessionId }, query] = await Promise.all([getDictionary(), params, searchParams]);
  const code = typeof query.c === "string" ? query.c : "";
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={t.checkIn.title} next={checkInPath(sessionId, code)} />;
  return <CheckInRun target={{ sessionId, code }} timeZone={owner.timeZone} />;
}

/** "Отметка на занятии" (PRD wave-3 §5): where the trainer's check-in QR leads. */
export default async function CheckInPage(props: Props) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.checkIn.title} back={{ fallbackHref: "/client/sessions" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <CheckIn params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
