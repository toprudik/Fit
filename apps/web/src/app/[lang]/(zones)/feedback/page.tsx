import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { getDictionary } from "@/i18n/server";
import { routeOf } from "@/lib/feedback/input";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.feedback.title };
}

async function Form({ searchParams }: { searchParams: PageProps<"/[lang]/feedback">["searchParams"] }) {
  const { from } = await searchParams;
  const route = routeOf(typeof from === "string" ? from : null);
  return <FeedbackForm from={route} backHref={route ?? "/"} />;
}

/**
 * "Обратная связь" (PRD wave-1 §2.13, screens.md "Обратная связь"), opened from the profile in both zones with
 * `?from=` set to the screen it was opened on. Belongs to no zone, like settings.
 */
export default async function FeedbackPage({ searchParams }: PageProps<"/[lang]/feedback">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.feedback.title} back={{ fallbackHref: "/" }} />}>
      <div className="w-full max-w-2xl pt-4 md:pt-0">
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
