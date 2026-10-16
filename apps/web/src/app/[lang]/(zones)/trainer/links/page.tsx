import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { Suspense } from "react";
import { ClientLinkPanel } from "@/components/client-links/client-link-panel";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { clientEnv } from "@/env/client";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { clientLinkUrl } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  return <ClientLinkPanel link={link} code={data.code} qrSvg={qrSvg} uses={formatNumber(locale, data.uses_count)} />;
}

/**
 * "QR и ссылки" (screens.md §2.2, PRD wave-1 §2.3): the trainer's permanent client link with its QR
 * and code. Trial links join this screen with their own feature.
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
