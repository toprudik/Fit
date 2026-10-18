import type { Metadata } from "next";
import { DelegatedPage } from "@/components/delegations/delegated-page";
import { getDictionary } from "@/i18n/server";

// A pair id is known only at request time (see the client card).
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.delegatedZone.title };
}

/** A delegated client's card: what the owner trainer let the assistant see and do (PRD wave-3 §1 rules 3, 10). */
export default function DelegatedClientPage(props: PageProps<"/[lang]/trainer/clients/delegated/[coachingId]">) {
  return <DelegatedPage params={props.params} />;
}
