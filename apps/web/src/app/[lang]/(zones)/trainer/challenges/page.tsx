import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupChallenges } from "@/components/challenges/group-challenges";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.challenges.title };
}

/**
 * "Челленджи" of the trainer for all their clients, without a group (marketing viral item 5): the list and
 * "Новый челлендж". Group challenges stay on their group.
 */
export default async function TrainerChallengesPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.challenges.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <GroupChallenges groupId={null} />
        </Suspense>
      </div>
    </Screen>
  );
}
