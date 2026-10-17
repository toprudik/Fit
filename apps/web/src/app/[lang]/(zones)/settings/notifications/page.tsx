import type { Metadata } from "next";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BroadcastsSwitch } from "@/components/groups/broadcast";
import { NotificationSettings } from "@/components/reminders/notification-settings";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadMyGroups, type MyGroup } from "@/lib/groups/load";
import { loadNotificationSettings } from "@/lib/reminders/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.notificationSettings.title };
}

/** The client's groups and one broadcast switch per trainer (PRD wave-2 §6.9). Members of a group stay hidden. */
function ClientGroups({ copy, goals, groups }: { copy: Dictionary["trainerGroups"]["client"]; goals: Dictionary["trainerGroups"]["goals"]; groups: MyGroup[] }) {
  const trainers = [...new Map(groups.map((group) => [group.coachingId, group])).values()];
  return (
    <>
      <ListGroup header={copy.header} footer={copy.footer}>
        {groups.map((group) => (
          <ListRow
            key={group.groupId}
            leading={<span aria-hidden className="size-3 shrink-0 rounded-full bg-surface-3" style={group.color ? { backgroundColor: group.color } : undefined} />}
            title={group.name}
            subtitle={group.goal ? interpolate(copy.trainerGoal, { name: group.trainerName, goal: goals[group.goal].toLowerCase() }) : interpolate(copy.trainer, { name: group.trainerName })}
          />
        ))}
      </ListGroup>
      <ListGroup header={copy.broadcasts} footer={copy.broadcastsFooter}>
        {trainers.map((group) => (
          <ListRow
            key={group.coachingId}
            title={interpolate(copy.from, { name: group.trainerName })}
            trailing={<BroadcastsSwitch coachingId={group.coachingId} trainerName={group.trainerName} muted={group.muted} />}
          />
        ))}
      </ListGroup>
    </>
  );
}

async function Settings() {
  const t = await getDictionary();
  const [data, groups] = await Promise.all([loadNotificationSettings(), loadMyGroups().catch(() => [])]);
  if (!data) {
    return (
      <EmptyState
        icon={Bell}
        title={t.notificationSettings.title}
        description={t.notificationSettings.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/settings/notifications")}`}>{t.notificationSettings.signIn}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <NotificationSettings data={data} />
      {groups.length > 0 ? <ClientGroups copy={t.trainerGroups.client} goals={t.trainerGroups.goals} groups={groups} /> : null}
    </div>
  );
}

/** "Уведомления" (screens.md /settings/notifications, PRD wave-1 §2.9). */
export default async function NotificationSettingsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.notificationSettings.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Settings />
        </Suspense>
      </div>
    </Screen>
  );
}
