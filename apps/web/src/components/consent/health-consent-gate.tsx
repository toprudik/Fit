import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/server";
import { mayOpenHealthSections, healthConsentPath } from "@/lib/consent/health";

/** "Нужно согласие": what a health section shows in place of its content until the client gives the consent. */
export async function HealthConsentCard({ next, headingLevel = 2 }: { next: string; headingLevel?: 2 | 3 }) {
  const t = await getDictionary();
  const copy = t.healthConsentGate;
  return (
    <EmptyState
      icon={ShieldCheck}
      title={copy.title}
      description={copy.text}
      headingLevel={headingLevel}
      action={
        <Button asChild size="lg">
          <Link href={healthConsentPath(next)}>{copy.give}</Link>
        </Button>
      }
    />
  );
}

/**
 * Health sections (anketa, measurements, photos, nutrition, steps and sleep) open only with the health data
 * consent (legal А3, 152-FZ art. 10): without it they show the card, and the consent screen brings the client back
 * to `next`. Reads cookies, so it sits behind a Suspense boundary.
 */
export async function HealthConsentGate({
  next,
  headingLevel,
  children,
}: {
  next: string;
  headingLevel?: 2 | 3;
  children: React.ReactNode;
}) {
  if (await mayOpenHealthSections()) return children;
  return <HealthConsentCard next={next} headingLevel={headingLevel} />;
}

/**
 * A whole health screen behind the consent, for a segment's layout: without the consent the screen keeps its title
 * and "Назад" and shows the card in place of the content.
 */
export async function HealthConsentScreen({
  next,
  title,
  backHref,
  children,
}: {
  next: string;
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  if (await mayOpenHealthSections()) return children;
  return (
    <Screen header={<ScreenHeader title={title} back={{ fallbackHref: backHref }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <HealthConsentCard next={next} />
      </div>
    </Screen>
  );
}
