import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { Suspense } from "react";
import { ClientLinkPanel } from "@/components/client-links/client-link-panel";
import { TrialLinkForm } from "@/components/trial-links/trial-link-form";
import { TrialLinkList, type TrialLinkItem } from "@/components/trial-links/trial-link-list";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { clientEnv } from "@/env/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatNumber, interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { clientLinkUrl } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTrialPrice, trialUrl } from "@/lib/trial-links/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.clientLinks.trainer.title };
}

async function LinkSection() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.clientLinks.trainer;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) {
    return (
      <EmptyState
        icon={QrCode}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/links")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  // Creates the link the first time a trainer opens the screen (screens.md: it exists automatically).
  const { data, error } = await supabase.rpc("my_client_invite").single();
  if (error || !data) {
    if (error?.message !== "not_a_trainer") console.error("loading the client link failed", error?.code);
    return <EmptyState icon={QrCode} title={copy.title} description={error?.message === "not_a_trainer" ? copy.notTrainer : copy.failed} />;
  }

  const link = clientLinkUrl(data.token, clientEnv.NEXT_PUBLIC_APP_URL);
  // Dark modules on white whatever the theme: that is what scanners read best.
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return (
    <div className="flex flex-col gap-10">
      <ClientLinkPanel link={link} code={data.code} qrSvg={qrSvg} uses={formatNumber(locale, data.uses_count)} />
      <TrialSection t={t} locale={locale} supabase={supabase} userId={session.claims.sub} />
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** "₽" for RUB in the viewer's language. */
function currencySymbol(locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

/**
 * "Ссылки на пробное" (screens.md §2.2 "QR и ссылки", PRD wave-1 §2.3 rule 4): the trainer's live links
 * with their terms and uses, and the form for a new one. Archived links are gone for good.
 */
async function TrialSection({ t, locale, supabase, userId }: { t: Dictionary; locale: Locale; supabase: Supabase; userId: string }) {
  const copy = t.trialLinks.trainer;
  const [links, places, trainer] = await Promise.all([
    supabase
      .from("trial_links")
      .select("id, token, title, duration_min, price_minor, currency, mode, location_id, is_enabled, uses_count")
      .eq("trainer_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("locations").select("id, name").eq("trainer_id", userId).is("archived_at", null).order("created_at"),
    supabase.from("trainer_profiles").select("default_currency, works_offline").eq("user_id", userId).single(),
  ]);
  if (links.error || places.error || trainer.error) {
    console.error("loading trial links failed", links.error?.code ?? places.error?.code ?? trainer.error?.code);
    return <p className="text-callout text-ink-2">{copy.actionFailed}</p>;
  }

  const placeName = new Map(places.data.map((place) => [place.id, place.name]));
  const items: TrialLinkItem[] = links.data.map((link) => ({
    id: link.id,
    title: link.title,
    terms: [
      interpolate(t.trialLinks.landing.minutes, { minutes: link.duration_min }),
      link.price_minor === 0 ? t.trialLinks.landing.free : formatTrialPrice(locale, link.price_minor, link.currency),
      link.mode === "online"
        ? t.trialLinks.landing.online
        : ((link.location_id && placeName.get(link.location_id)) ?? (link.mode === "offline" ? t.trialLinks.landing.offline : null)),
    ]
      .filter(Boolean)
      .join(", "),
    url: trialUrl(link.token, clientEnv.NEXT_PUBLIC_APP_URL),
    enabled: link.is_enabled,
    uses: link.uses_count,
  }));

  return (
    <section aria-labelledby="trial-links" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="trial-links" className="text-title-3">
          {copy.title}
        </h2>
        <p className="text-callout text-ink-2">{copy.text}</p>
      </div>
      {items.length > 0 ? <TrialLinkList links={items} /> : <p className="text-subhead text-ink-2">{copy.empty}</p>}
      <TrialLinkForm
        currency={currencySymbol(locale, trainer.data.default_currency)}
        defaultMode={trainer.data.works_offline ? "offline" : "online"}
        locations={places.data}
      />
    </section>
  );
}

/**
 * "QR и ссылки" (screens.md §2.2, PRD wave-1 §2.3): the trainer's permanent client link with its QR
 * and code, and the trial links below it.
 */
export default async function TrainerLinksPage() {
  const t = await getDictionary();
  const copy = t.clientLinks.trainer;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <LinkSection />
        </Suspense>
      </div>
    </Screen>
  );
}
