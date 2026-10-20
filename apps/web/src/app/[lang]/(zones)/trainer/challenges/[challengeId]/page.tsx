import type { Metadata } from "next";
import { Suspense } from "react";
import { TrainerChallengeView } from "@/components/challenges/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

// The shell reads the route segments (AppShell), and a challenge id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.challenges.trainer.title };
}

async function Challenge({ params }: { params: PageProps<"/[lang]/trainer/challenges/[challengeId]">["params"] }) {
  const { challengeId } = await params;
  return <TrainerChallengeView challengeId={challengeId} />;
}

/** A challenge of the trainer for all clients (marketing viral item 5, PRD wave-3 §2.3–2.4): every participant with their score. */
export default async function TrainerChallengePage(props: PageProps<"/[lang]/trainer/challenges/[challengeId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.challenges.trainer.title} back={{ fallbackHref: "/trainer/challenges" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <Challenge params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
