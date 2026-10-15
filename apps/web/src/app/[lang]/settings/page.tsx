import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { PushTransition } from "@/components/shell/push-transition";
import { ScreenHeader } from "@/components/shell/screen-header";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.settings.title };
}

/**
 * Theme and language, opened from the profile (screens.md §2.3). A pushed screen outside the zones:
 * no tab bar or side menu, "Back" leads to where the user came from. Static: the saved choices are
 * read in the browser.
 */
export default async function SettingsPage() {
  const t = await getDictionary();
  return (
    <main id="main" className="overflow-x-clip pr-[var(--safe-right)] pl-[var(--safe-left)]">
      <PushTransition>
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(var(--space-8),var(--safe-bottom))] md:px-6 xl:px-8">
          <ScreenHeader title={t.settings.title} back={{ fallbackHref: "/" }} />
          <SettingsPanel />
        </div>
      </PushTransition>
    </main>
  );
}
