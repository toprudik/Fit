import type { Metadata } from "next";
import { ListChecks, Store, UserRound } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { Suspense } from "react";
import { ShowcaseConsent } from "@/components/public-data/showcase-consent";
import { ShowcaseAddressForm, StoryCardsSwitch } from "@/components/showcase/showcase-forms";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ShareClientLink } from "@/components/trainer-wizard/share-client-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { clientEnv } from "@/env/client";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { loadMyPlaces, loadMyPublicConsent } from "@/lib/public-data/load";
import { showcasePath, showcaseUrl } from "@/lib/showcase/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { editPath, PROFILE_EDIT_PATH } from "@/lib/trainer-wizard/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.showcase.editor.title };
}

/** The open showcase: its QR, address, "Поделиться витриной" and "Открыть витрину". */
async function OpenShowcase({ t, slug }: { t: Dictionary; slug: string }) {
  const copy = t.showcase.editor;
  const link = showcaseUrl(slug, clientEnv.NEXT_PUBLIC_APP_URL);
  // Dark modules on white whatever the theme: that is what scanners read best.
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return (
    <section aria-label={copy.qr} className="flex flex-col items-center gap-4">
      <div
        role="img"
        aria-label={copy.qr}
        className="size-56 overflow-hidden rounded-md bg-white [&>svg]:size-full"
        // Generated on the server from the showcase address by the qrcode package, not from user input.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="text-center text-subhead break-all text-ink-2 select-all">{link}</p>
      <div className="flex w-full flex-col gap-3">
        <ShareClientLink link={link} label={copy.share} text={copy.shareText} />
        <Button asChild variant="secondary" size="lg" block>
          <Link href={showcasePath(slug)}>{copy.open}</Link>
        </Button>
      </div>
    </section>
  );
}

/** Why the showcase is closed: a rejected verification (Q60) or the trainer's own switch. */
function ClosedNotice({ t, rejected }: { t: Dictionary; rejected: boolean }) {
  const copy = t.showcase.editor;
  const notice = rejected ? copy.rejected : copy.hidden;
  return (
    <section aria-labelledby="showcase-closed" className={`flex flex-col gap-3 rounded-lg p-4 ${rejected ? "bg-danger-soft" : "bg-surface-1"}`}>
      <h2 id="showcase-closed" className="text-headline">
        {notice.title}
      </h2>
      <p className="text-subhead">{notice.text}</p>
      {rejected ? (
        <Button asChild size="lg" block>
          <Link href="/trainer/verification">{copy.rejected.action}</Link>
        </Button>
      ) : null}
    </section>
  );
}

async function ShowcaseEditor() {
  const t = await getDictionary();
  const copy = t.showcase.editor;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) {
    return (
      <EmptyState
        icon={Store}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/showcase")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const [{ data: trainer, error }, consent, places] = await Promise.all([
    supabase
      .from("trainer_profiles")
      .select("slug, is_public, verification_status, headline, specialties, story_card_showcase")
      .eq("user_id", userId)
      .maybeSingle(),
    loadMyPublicConsent("showcase"),
    loadMyPlaces(),
  ]);
  if (error) console.error("loading the showcase failed", error.code);
  if (!trainer) return <EmptyState icon={Store} title={copy.title} description={error ? copy.failed : copy.notTrainer} />;

  const rejected = trainer.verification_status === "rejected";
  const open = trainer.is_public && !rejected;
  const missing = [
    trainer.headline ? null : { title: copy.checklist.headline, href: editPath("profile") },
    trainer.specialties.length > 0 ? null : { title: copy.checklist.specialties, href: editPath("format") },
  ].filter((item) => item !== null);

  return (
    <div className="flex flex-col gap-6">
      {open ? <OpenShowcase t={t} slug={trainer.slug} /> : <ClosedNotice t={t} rejected={rejected} />}
      {missing.length > 0 ? (
        <ListGroup header={copy.checklist.title}>
          {missing.map((item) => (
            <ListRow key={item.href} icon={ListChecks} title={item.title} subtitle={copy.checklist.fill} href={item.href} />
          ))}
        </ListGroup>
      ) : null}
      <ListGroup>
        <ListRow icon={UserRound} title={t.trainerWizard.edit.open} subtitle={t.trainerWizard.edit.openText} href={PROFILE_EDIT_PATH} />
      </ListGroup>
      <ShowcaseAddressForm slug={trainer.slug} />
      <StoryCardsSwitch enabled={trainer.story_card_showcase} />
      <ShowcaseConsent visible={trainer.is_public} consent={consent} places={places} />
    </div>
  );
}

/**
 * "Витрина" in the trainer zone (screens.md §2.2 "Витрина (редактор)"): the showcase QR and address,
 * sharing, the address and the on/off switch. A rejected verification hides the showcase and offers
 * to send the documents again (Q60). Prices join with packages in wave 2.
 */
export default async function TrainerShowcasePage() {
  const t = await getDictionary();
  const copy = t.showcase.editor;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ShowcaseEditor />
        </Suspense>
      </div>
    </Screen>
  );
}
