import type { Metadata } from "next";
import { HelpScreen } from "@/components/help/help-screen";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.help.title };
}

/** Client help (FAQ), opened from the profile. Static. */
export default function ClientHelpPage() {
  return <HelpScreen zone="client" back="/client" />;
}
