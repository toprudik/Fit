import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Suspense } from "react";
import { AddClientButton, ClientList } from "@/components/pairs/client-list";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { parseClientFilter } from "@/lib/pairs/clients";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.clients };
}

async function ClientsFromParams({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/clients">["searchParams"] }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 64) : "";
  return <ClientList filter={parseClientFilter(params.filter)} query={query} />;
}

/** The trainer's clients: search, filters and the list; a client opens as a pushed card (screens.md §3.2). */
export default async function TrainerClientsPage(props: PageProps<"/[lang]/trainer/clients">) {
  const t = await getDictionary();
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.clients} actions={<AddClientButton label={t.pairs.cards.add} />} />}>
          <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
            <ClientsFromParams searchParams={props.searchParams} />
          </Suspense>
        </Screen>
      }
      detail={<DetailPlaceholder icon={Users} text={t.screens.trainer.clients.detail} />}
    />
  );
}
