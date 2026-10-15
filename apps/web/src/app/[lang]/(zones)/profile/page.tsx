import type { Metadata } from "next";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.profile.title };
}

/**
 * The profile as its own screen (screens.md §2.3), for links from outside the app. Inside the zones
 * the avatar opens the same content in a sheet. Like settings it keeps the zone shown before it.
 * Static: who is signed in arrives separately.
 */
export default async function ProfilePage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.profile.title} back={{ fallbackHref: "/" }} />}>
      {/* On a phone the header band ends right above: the first caption keeps a gap from its edge. */}
      <div className="w-full max-w-2xl pt-4 md:pt-0">
        <ProfilePanel />
      </div>
    </Screen>
  );
}
