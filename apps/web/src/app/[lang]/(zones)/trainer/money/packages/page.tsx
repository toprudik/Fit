import type { Metadata } from "next";
import { Tags } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PackageList, type PackageItem } from "@/components/packages/package-list";
import { PriceGrid } from "@/components/packages/price-grid";
import { TemplateForm } from "@/components/packages/template-form";
import { PaymentLinkManager } from "@/components/payment-links/payment-link-manager";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { currencySymbol, formatMoney } from "@/lib/money/format";
import { priceGrid } from "@/lib/packages/grid";
import { loadTrainerPackages } from "@/lib/packages/load";
import { packageTitle, priceGridItems } from "@/lib/packages/present";

const PATH = "/trainer/money/packages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.money.packages.title };
}

async function PackagesContent() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerPackages()]);
  const copy = t.money.packages;
  if (data.status === "signed-out") {
    return (
      <EmptyState
        icon={Tags}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(PATH)}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (data.status !== "ok") {
    return <EmptyState icon={Tags} title={copy.title} description={data.status === "not-trainer" ? copy.notTrainer : copy.failed} />;
  }

  const symbol = currencySymbol(locale, data.currency);
  const grid = priceGrid(data.packages);
  // What clients see: the public packs in the grid's currency (the showcase reads the same rows).
  const shown = priceGrid(data.packages.filter((pack) => pack.isPublic && pack.currency === data.currency));
  const items: PackageItem[] = grid.map((row) => ({
    ...row,
    otherCurrency: row.currency !== data.currency,
    terms: [
      formatMoney(locale, row.priceMinor, row.currency),
      // The count only when the name does not already say it.
      row.title !== packageTitle(t, locale, row.sessionsCount) ? plural(locale, row.sessionsCount, copy.titles.pack) : null,
      row.appliesTo === "any" ? null : copy.appliesTo[row.appliesTo],
      row.validityDays ? plural(locale, row.validityDays, copy.validity.days) : copy.validity.none,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <div className="flex flex-col gap-10">
      {data.packages.length === 0 ? (
        <>
          <EmptyState icon={Tags} title={copy.emptyTitle} description={copy.emptyText} />
          <TemplateForm currency={data.currency} symbol={symbol} />
        </>
      ) : (
        <>
          <section aria-labelledby="client-grid" className="flex flex-col gap-3">
            <h2 id="client-grid" className="px-1 text-headline">
              {copy.grid.title}
            </h2>
            {shown.length > 0 ? (
              <PriceGrid
                bestLabel={copy.grid.best}
                items={priceGridItems(
                  shown.map((row) => ({ ...row, key: row.id })),
                  t,
                  locale,
                )}
              />
            ) : (
              <p className="px-1 text-subhead text-ink-2">{copy.grid.empty}</p>
            )}
          </section>
          <PackageList packages={items} symbol={symbol} />
        </>
      )}
      <PaymentLinkManager links={data.paymentLinks} />
    </div>
  );
}

/**
 * "Пакеты и ценовая сетка" (screens.md §2.2, PRD wave-1 §2.8 rules 1–3 and 15): the grid as clients see it,
 * every package with edit and remove, the template while there are none, and the trainer's payment links.
 */
export default async function TrainerPackagesPage() {
  const t = await getDictionary();
  const copy = t.money.packages;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/money" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <PackagesContent />
        </Suspense>
      </div>
    </Screen>
  );
}
