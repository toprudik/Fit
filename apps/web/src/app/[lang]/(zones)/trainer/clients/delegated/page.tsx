import type { Metadata } from "next";
import { DelegatedPage } from "@/components/delegations/delegated-page";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.delegatedZone.title };
}

/** «Делегировано мне»: clients other trainers handed to the caller as their assistant (PRD wave-3 §1 rule 10). */
export default function DelegatedClientsPage() {
  return <DelegatedPage />;
}
