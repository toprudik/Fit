import type { Metadata } from "next";
import { HelpScreen } from "@/components/help/help-screen";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.help.title };
}

/** Trainer help (FAQ), opened from "Ещё" and the profile. Static. */
export default function TrainerHelpPage() {
  return <HelpScreen zone="trainer" back="/trainer/more" />;
}
