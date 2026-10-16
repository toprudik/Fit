import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClientPassDetail } from "@/components/passes/client-pass";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadClientPass } from "@/lib/passes/load";

// A pass id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.money.client.title };
}

async function PassFromParams({ params }: { params: PageProps<"/[lang]/client/passes/[passId]">["params"] }) {
  const [{ passId }, t] = await Promise.all([params, getDictionary()]);
  const data = await loadClientPass(passId);
  if (!data) notFound();
  return (
    <Screen
      header={
        <ScreenHeader
          title={data.pass.title}
          subtitle={interpolate(t.money.client.trainer, { name: data.trainerName || t.botMessages.unnamedTrainer })}
          back={{ fallbackHref: "/client/passes" }}
        />
      }
    >
      <div className="pt-3 md:pt-0">
        <ClientPassDetail data={data} />
      </div>
    </Screen>
  );
}

/** One pass of the client: what is left, "Оплатить", "Я оплатил", payments and history (screens.md "Абонемент"). */
export default async function ClientPassPage(props: PageProps<"/[lang]/client/passes/[passId]">) {
  const t = await getDictionary();
  return (
    <Suspense
      fallback={
        <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 px-4 pt-20 md:px-6 md:pt-6 xl:px-8">
          <Skeleton className="mx-auto size-36 rounded-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <PassFromParams params={props.params} />
    </Suspense>
  );
}
