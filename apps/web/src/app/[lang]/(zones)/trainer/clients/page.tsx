import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Suspense } from "react";
import { ClientsSwitch } from "@/components/delegations/assisted";
import { AddClientButton, ClientList } from "@/components/pairs/client-list";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Skeleton, SkeletonChips, SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { hasAssistance } from "@/lib/delegations/assistant";
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

/** «Мои клиенты» / «Делегировано мне», only for a trainer who assists someone (PRD wave-3 §1 rule 10). */
async function AssistantSwitch({ t }: { t: Dictionary }) {
  return (await hasAssistance()) ? <ClientsSwitch t={t} current="mine" /> : null;
}

/** The trainer's clients: search, filters and the list; a client opens as a pushed card (screens.md §3.2). */
export default async function TrainerClientsPage(props: PageProps<"/[lang]/trainer/clients">) {
  const t = await getDictionary();
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.trainer.clients} actions={<AddClientButton label={t.pairs.cards.add} />} />}>
          {/* Its own boundary, so switching back and forth does not flash it with the list. */}
          <Suspense fallback={null}>
            <AssistantSwitch t={t} />
          </Suspense>
          <Suspense
            fallback={
              <SkeletonScreen label={t.common.loading} className="pt-4 md:pt-0">
                <Skeleton className="h-11 rounded-md" />
                <SkeletonChips widths={["4.5rem", "6.5rem", "8rem", "5rem"]} />
                <SkeletonRows leading="avatar" rows={3} />
              </SkeletonScreen>
            }
          >
            <ClientsFromParams searchParams={props.searchParams} />
          </Suspense>
        </Screen>
      }
      detail={<DetailPlaceholder icon={Users} text={t.screens.trainer.clients.detail} />}
    />
  );
}
