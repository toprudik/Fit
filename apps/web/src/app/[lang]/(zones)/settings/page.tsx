import type { Metadata } from "next";
import { Bell, CalendarDays, Scale } from "lucide-react";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.title };
}

/**
 * Theme and language, with links to notifications and the calendar feed, opened from the profile or the side menu (screens.md §2.3). It belongs to no
 * zone, so the shell keeps the zone shown before it: a pushed screen without the tab bar on a phone,
 * the side menu with its own item from 768px. "Back" leads to where the user came from. Static: the
 * saved choices are read in the browser.
 */
export default async function SettingsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.settings.title} back={{ fallbackHref: "/" }} />}>
      {/* On a phone the header band ends right above: the first caption keeps a gap from its edge. */}
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-4 md:pt-0">
        <SettingsPanel />
        <ListGroup>
          <ListRow icon={Bell} title={t.notificationSettings.title} href="/settings/notifications" />
          <ListRow icon={CalendarDays} title={t.calendar.title} href="/settings/calendar" />
        </ListGroup>
        <ListGroup>
          <ListRow icon={Scale} title={t.workouts.licenses.title} href="/settings/licenses" />
        </ListGroup>
      </div>
    </Screen>
  );
}
