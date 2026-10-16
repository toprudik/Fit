import type { Metadata } from "next";
import { TrainerPairPage } from "@/components/pairs/trainer-pair-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time, as on the other sections of the card.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.pairs.tabs.payments };
}

/** Client card, "Оплаты": the debt and every payment; `?action=new` opens "Отметить оплату" (screens.md 4.5). */
export default function TrainerPairPaymentsPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/payments">) {
  return <TrainerPairPage params={props.params} tab="payments" searchParams={props.searchParams} />;
}
