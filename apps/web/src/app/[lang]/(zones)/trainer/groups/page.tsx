import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Suspense } from "react";
import { GroupFormButton } from "@/components/groups/group-form";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadGroups } from "@/lib/groups/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerGroups.title };
}

async function Groups() {
  const [t, data] = await Promise.all([getDictionary(), loadGroups()]);
  if (!data) return null;
  const copy = t.trainerGroups;
  if (!data.access.groups) {
    return <TierLock plan="trainer_pro" title={copy.lockTitle} description={copy.lockText} feature="trainer.groups" requested={data.access.requested} />;
  }
  if (data.groups.length === 0) {
    return <EmptyState icon={Users} title={copy.empty} description={copy.emptyText} action={<GroupFormButton />} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <ListGroup>
        {data.groups.map((group) => (
          <ListRow
            key={group.id}
            href={`/trainer/groups/${group.id}`}
            leading={<span aria-hidden className="size-3 shrink-0 rounded-full bg-surface-3" style={group.color ? { backgroundColor: group.color } : undefined} />}
            title={group.name}
            subtitle={[
              group.goal ? copy.goals[group.goal] : null,
              interpolate(copy.members, { count: group.members }),
              group.template ? interpolate(copy.templateKcal, { kcal: group.template }) : null,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        ))}
      </ListGroup>
      <div>
        <GroupFormButton variant="secondary" />
      </div>
    </div>
  );
}

/** «Группы» тренера (PRD wave-2 §6, screens.md /trainer/groups), from «Ещё». A Pro feature. */
export default async function TrainerGroupsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerGroups.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Groups />
        </Suspense>
      </div>
    </Screen>
  );
}
