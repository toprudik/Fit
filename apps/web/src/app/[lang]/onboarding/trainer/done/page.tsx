import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { ShareClientLink } from "@/components/trainer-wizard/share-client-link";
import { WizardScreen } from "@/components/trainer-wizard/wizard-screen";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { clientInviteUrl, ensureClientInvite } from "@/lib/trainer-wizard/client-link";
import { loadWizard, type WizardData } from "@/lib/trainer-wizard/load";
import { isSpecialty } from "@/lib/trainer-wizard/options";
import { stepPath, WIZARD_START_PATH, WIZARD_STEPS } from "@/lib/trainer-wizard/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerWizard.done.title };
}

const BADGE_TONES = { not_submitted: "neutral", pending: "warning", verified: "success", rejected: "danger" } as const;

/** The showcase as a client sees it, in short: photo, name, badge, format and specialties. */
function Preview({ t, data }: { t: Dictionary; data: NonNullable<WizardData> }) {
  const copy = t.trainerWizard.done;
  const { trainer } = data;
  const format = trainer.works_offline && trainer.works_online ? "both" : trainer.works_online ? "online" : "offline";
  const status = trainer.verification_status;
  const details = [copy.formats[format], trainer.city].filter(Boolean).join(", ");

  return (
    <section aria-labelledby="showcase-preview" className="flex flex-col gap-1.5">
      <h2 id="showcase-preview" className="px-4 text-footnote text-ink-2">
        {copy.preview}
      </h2>
      <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <PersonAvatar name={data.name} src={data.photoUrl} size={64} decorative />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-headline">{data.name}</p>
            {trainer.headline ? <p className="text-subhead text-ink-2">{trainer.headline}</p> : null}
            <Badge tone={BADGE_TONES[status]} className="self-start">
              {copy.verification[status]}
            </Badge>
          </div>
        </div>
        <p className="text-subhead text-ink-2">{details}</p>
        {trainer.specialties.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {trainer.specialties.map((key) => (
              <li key={key} className="rounded-full bg-surface-2 px-3 py-1 text-footnote">
                {isSpecialty(key) ? t.trainerWizard.specialties[key] : key}
              </li>
            ))}
          </ul>
        ) : null}
        {status === "not_submitted" || status === "pending" ? <p className="text-footnote text-ink-2">{copy.verificationHint}</p> : null}
      </div>
    </section>
  );
}

async function ClientLink({ t, token }: { t: Dictionary; token: string | null }) {
  const copy = t.trainerWizard.done;
  if (!token) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout text-ink-2">{copy.noLink}</p>
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/trainer/links">{copy.openLinks}</Link>
        </Button>
      </div>
    );
  }
  const link = clientInviteUrl(token);
  // Dark modules on white whatever the theme: that is what scanners read best.
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return (
    <section aria-labelledby="client-link" className="flex flex-col items-center gap-4">
      <h2 id="client-link" className="sr-only">
        {copy.link}
      </h2>
      <div
        role="img"
        aria-label={copy.qr}
        className="size-56 overflow-hidden rounded-md bg-white [&>svg]:size-full"
        // Generated on the server from the client link by the qrcode package, not from user input.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="text-center text-subhead break-all text-ink-2 select-all">{link}</p>
      <ShareClientLink link={link} />
    </section>
  );
}

async function DoneContent() {
  const [t, wizard] = await Promise.all([getDictionary(), loadWizard()]);
  if (wizard.status !== "ok") redirect("/onboarding/trainer");
  const { data, supabase } = wizard;

  // The trainer's working link, made on the first visit; the database keeps it to one.
  const token = await ensureClientInvite(supabase);

  const copy = t.trainerWizard.done;
  return (
    <div className="flex flex-col gap-6">
      <ClientLink t={t} token={token} />
      <Preview t={t} data={data} />
      <div className="flex flex-col gap-3">
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/trainer/schedule">{copy.schedule}</Link>
        </Button>
        <Button asChild variant="ghost" size="lg" block>
          <Link href={WIZARD_START_PATH}>{copy.edit}</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The wizard's result (screens.md §3.1, flow 4.1 step 7): the client link with its QR and "Поделиться",
 * a preview of the showcase and the verification status. Working with clients starts right here.
 */
export default async function TrainerWizardDonePage() {
  const t = await getDictionary();
  const copy = t.trainerWizard.done;
  return (
    <WizardScreen
      progress={1}
      progressLabel={t.trainerWizard.progress}
      back={stepPath(WIZARD_STEPS[WIZARD_STEPS.length - 1])}
      title={copy.title}
      text={copy.text}
    >
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col items-center gap-4">
            <Skeleton className="size-56" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <DoneContent />
      </Suspense>
    </WizardScreen>
  );
}
