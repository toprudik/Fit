import type { Metadata } from "next";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { PushTransition } from "@/components/shell/push-transition";
import { ScreenHeader } from "@/components/shell/screen-header";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.profile.title };
}

/**
 * The profile as its own screen (screens.md §2.3), for links from outside the app. Inside the zones
 * the header avatar opens the same content in a sheet. Static: who is signed in arrives separately.
 */
export default async function ProfilePage() {
  const t = await getDictionary();
  return (
    <main id="main" className="overflow-x-clip pr-[var(--safe-right)] pl-[var(--safe-left)]">
      <PushTransition>
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(var(--space-8),var(--safe-bottom))] md:px-6 xl:px-8">
          <ScreenHeader title={t.profile.title} back={{ fallbackHref: "/" }} />
          <ProfilePanel zone={null} />
        </div>
      </PushTransition>
    </main>
  );
}
