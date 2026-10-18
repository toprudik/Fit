import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { PriceCalculator } from "@/components/price-calculator/price-calculator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { calculatorCtaHref, waitlistSource } from "@/lib/waitlist/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.priceCalculator.title, description: t.priceCalculator.description };
}

/** The calculator with the visit's channel label carried on to the waitlist. */
async function Calculator({ searchParams }: { searchParams: PageProps<"/[lang]/for-trainers/calculator">["searchParams"] }) {
  return <PriceCalculator ctaHref={calculatorCtaHref(waitlistSource(await searchParams))} />;
}

/**
 * «Калькулятор цены абонемента» (marketing backlog item 9): a public tool for any trainer, without signing in,
 * on the rules of DaFit's price grid. It leads to the waitlist on /for-trainers.
 */
export default async function PriceCalculatorPage(props: PageProps<"/[lang]/for-trainers/calculator">) {
  const t = await getDictionary();
  const copy = t.priceCalculator;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-10))] md:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link href="/for-trainers" className="flex items-center gap-2 text-headline">
          <DaMark className="size-8" />
          DaFit
        </Link>
        <Button asChild variant="ghost">
          <Link href="/for-trainers">{copy.aboutDaFit}</Link>
        </Button>
      </header>

      <section aria-labelledby="calculator-title" className="flex max-w-2xl flex-col gap-4">
        <h1 id="calculator-title" className="text-large-title">
          {copy.heading}
        </h1>
        <p className="text-body text-ink-2">{copy.lead}</p>
      </section>

      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 md:max-w-md">
            <Skeleton className="h-13 w-full" />
            <Skeleton className="h-13 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <Calculator searchParams={props.searchParams} />
      </Suspense>

      <footer className="text-footnote text-ink-2">{copy.footer}</footer>
    </main>
  );
}
