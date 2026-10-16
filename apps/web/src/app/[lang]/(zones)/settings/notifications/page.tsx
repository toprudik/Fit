import type { Metadata } from "next";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NotificationSettings } from "@/components/reminders/notification-settings";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadNotificationSettings } from "@/lib/reminders/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.notificationSettings.title };
}

async function Settings() {
  const t = await getDictionary();
  const data = await loadNotificationSettings();
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
  return <NotificationSettings data={data} />;
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
