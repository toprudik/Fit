import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { DaMark } from "@/components/brand/da-mark";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary, getLocale } from "@/i18n/server";
import { LEGAL_PATH, legalSlugs } from "@/lib/legal/documents";
import { loadLegalDocument } from "@/lib/legal/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.legal.title, robots: { index: false, follow: false } };
}

/**
 * "Документы": the legal documents in the user's language. Public and static, so it opens before
 * signing in and before the beta terms are accepted (lib/navigation/routing).
 */
export default async function LegalIndexPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const documents = await Promise.all(
    legalSlugs(locale).map(async (slug) => ({ slug, title: (await loadLegalDocument(locale, slug))?.title ?? slug })),
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-6))]">
      <DaMark className="size-8" label="DaFit" />
      <div className="flex flex-col gap-3">
        <h1 className="text-large-title">{t.legal.title}</h1>
        <p className="text-callout text-ink-2">{t.legal.intro}</p>
      </div>
      <ListGroup>
        {documents.map((document) => (
          <ListRow key={document.slug} icon={FileText} title={document.title} href={`${LEGAL_PATH}/${document.slug}`} />
        ))}
      </ListGroup>
    </main>
  );
}
