import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { TrainersList } from "@/components/pairs/trainers-list";
import { DetailPlaceholder, MasterDetail } from "@/components/shell/screen";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.trainers };
}

export default async function ClientTrainersPage() {
  const t = await getDictionary();
  return <MasterDetail list={<TrainersList />} detail={<DetailPlaceholder icon={UserRound} text={t.screens.client.trainers.detail} />} />;
}
