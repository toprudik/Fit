import type { Metadata } from "next";
import { ClientsDetail } from "@/components/pairs/clients-detail";
import { NewCard } from "@/components/pairs/new-card";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.cards.title };
}

/** "Добавить клиента вручную" (screens.md): the link or a card of a client without an account. */
export default function NewCardPage() {
  return (
    <ClientsDetail>
      <NewCard />
    </ClientsDetail>
  );
}
