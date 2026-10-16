import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.licenses.title };
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent-ink underline underline-offset-2"
    >
      {children}
      <ExternalLink aria-hidden size={14} />
    </a>
  );
}

/** "Лицензии" (PRD wave-1 §2.10-2, WORK-7): the open data DaFit uses and its licenses. Static. */
export default async function LicensesPage() {
  const t = await getDictionary();
  const copy = t.workouts.licenses;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="px-1 text-callout text-ink-2">{copy.text}</p>
        <section aria-labelledby="license-wger" className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
          <h2 id="license-wger" className="text-headline">
            {copy.wgerTitle}
          </h2>
          <p className="text-body">{copy.wgerText}</p>
          <div className="flex flex-col gap-2 text-subhead">
            <External href="https://wger.de">{copy.wgerLink}</External>
            <External href="https://creativecommons.org/licenses/by-sa/4.0/">{copy.licenseLink}</External>
          </div>
        </section>
      </div>
    </Screen>
  );
}
