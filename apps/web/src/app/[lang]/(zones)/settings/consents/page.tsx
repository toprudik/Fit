import type { Metadata } from "next";
import { FileCheck, HeartPulse, Images, ShieldCheck, Store, UserX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HealthConsentRevoke } from "@/components/settings/health-consent-revoke";
import { PublicConsentRevoke } from "@/components/settings/public-consent-revoke";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { DELETION_PATH } from "@/lib/account/deletion";
import { CONSENT_PATH, CONSENTS_SETTINGS_PATH } from "@/lib/consent/beta-terms";
import { loadMyConsents } from "@/lib/consent/load";
import { withNext } from "@/lib/consent/next";
import { LEGAL_PATH } from "@/lib/legal/documents";
import { formatPlanDate } from "@/lib/plans/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.consent.settings.title };
}

async function Consents() {
  const [t, locale, consents] = await Promise.all([getDictionary(), getLocale(), loadMyConsents()]);
  const copy = t.consent.settings;
  if (!consents) return <EmptyState icon={UserX} title={copy.signedOut} />;
  const status = (acceptedAt: string | null) =>
    acceptedAt ? interpolate(copy.givenOn, { date: formatPlanDate(locale, acceptedAt, consents.timeZone) }) : copy.notGiven;

  return (
    <>
      <ListGroup
        header={copy.required}
        footer={
          <>
            {copy.requiredHint}{" "}
            <Link href={DELETION_PATH} className="text-accent-ink underline underline-offset-2">
              {copy.deleteAccount}
            </Link>
          </>
        }
      >
        <ListRow icon={FileCheck} title={copy.terms} subtitle={status(consents.terms.acceptedAt)} />
        <ListRow icon={ShieldCheck} title={copy.personal} subtitle={status(consents.personal.acceptedAt)} />
      </ListGroup>
      <div className="flex flex-col gap-3">
        <ListGroup header={copy.optional} footer={copy.healthHint}>
          <ListRow icon={HeartPulse} title={copy.health} subtitle={status(consents.health.acceptedAt)} />
        </ListGroup>
        <div className="px-4">
          {consents.health.acceptedAt ? (
            <HealthConsentRevoke />
          ) : (
            <Button asChild variant="secondary" block>
              <Link href={`${withNext(CONSENT_PATH, CONSENTS_SETTINGS_PATH)}&step=health`}>{copy.give}</Link>
            </Button>
          )}
        </div>
      </div>
      {consents.showcase ? (
        <div className="flex flex-col gap-3">
          <ListGroup footer={copy.showcaseHint}>
            <ListRow icon={Store} title={copy.showcase} subtitle={status(consents.showcase.acceptedAt)} />
          </ListGroup>
          <div className="px-4">
            {consents.showcase.acceptedAt ? (
              <PublicConsentRevoke scope="showcase" />
            ) : (
              <Button asChild variant="secondary" block>
                <Link href="/trainer/showcase">{copy.giveShowcase}</Link>
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <ListGroup footer={copy.storyHint}>
          <ListRow icon={Images} title={copy.story} subtitle={status(consents.story.acceptedAt)} />
        </ListGroup>
        {consents.story.acceptedAt ? (
          <div className="px-4">
            <PublicConsentRevoke scope="story" />
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * The consents the user gave and when (право 5; 152-FZ art. 9 part 2): the required ones are revoked only by deleting
 * the account, the health data one here with a button and given again through the consents screen. The consents to
 * publish (152-FZ art. 10.1) are revoked here too and given again on the showcase or the month report.
 */
export default async function ConsentsSettingsPage() {
  const t = await getDictionary();
  const copy = t.consent.settings;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 pb-8 md:pt-0">
        <p className="px-4 text-body">
          {copy.lead}{" "}
          <Link href={LEGAL_PATH} className="text-accent-ink underline underline-offset-2">
            {copy.documents}
          </Link>
        </p>
        <Suspense fallback={<SkeletonRows label={t.common.loading} />}>
          <Consents />
        </Suspense>
      </div>
    </Screen>
  );
}
