import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientChallengeView } from "@/components/challenges/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

// The shell reads the route segments (AppShell), and a challenge id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.challenges.client.title };
}

async function Challenge({ params }: { params: PageProps<"/[lang]/client/challenges/[challengeId]">["params"] }) {
  const { challengeId } = await params;
  return <ClientChallengeView challengeId={challengeId} />;
}

/** A challenge of the client's group (PRD wave-3 §2.3–2.4): joining, the score and the leaderboard. */
export default async function ClientChallengePage(props: PageProps<"/[lang]/client/challenges/[challengeId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.challenges.client.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <Challenge params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
