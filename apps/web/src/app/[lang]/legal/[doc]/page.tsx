import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DaMark } from "@/components/brand/da-mark";
import { LegalDocument } from "@/components/legal/legal-document";
import { getDictionary, getLocale } from "@/i18n/server";
import { ALL_LEGAL_SLUGS, LEGAL_PATH } from "@/lib/legal/documents";
import { loadLegalDocument } from "@/lib/legal/load";

export function generateStaticParams() {
  return ALL_LEGAL_SLUGS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/legal/[doc]">): Promise<Metadata> {
  const [t, locale, { doc }] = await Promise.all([getDictionary(), getLocale(), params]);
  const document = await loadLegalDocument(locale, doc);
  return { title: document?.title ?? t.legal.title, robots: { index: false, follow: false } };
}

/** One legal document in the user's language; a slug that language lacks is the app's 404. */
export default async function LegalDocumentPage({ params }: PageProps<"/[lang]/legal/[doc]">) {
  const [t, locale, { doc }] = await Promise.all([getDictionary(), getLocale(), params]);
  const document = await loadLegalDocument(locale, doc);
  if (!document) notFound();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex items-center justify-between gap-3">
        <Link href={LEGAL_PATH} className="inline-flex min-h-11 items-center gap-1 text-callout text-accent-ink">
          <ChevronLeft aria-hidden size={18} />
          {t.legal.all}
        </Link>
        <DaMark className="size-8" label="DaFit" />
      </div>
      <LegalDocument blocks={document.blocks} tableLabel={t.legal.table} />
    </main>
  );
}
