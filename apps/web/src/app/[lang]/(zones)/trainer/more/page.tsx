import type { Metadata } from "next";
import { ChartColumn, ClipboardList, Dumbbell, Gift, QrCode, ScanLine, Store, UserPlus } from "lucide-react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.more };
}

export default async function TrainerMorePage() {
  const t = await getDictionary();
  const copy = t.screens.trainer.more;
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.more} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <ListGroup footer={copy.later}>
          <ListRow icon={QrCode} iconTone="accent" title={copy.links} subtitle={copy.linksText} href="/trainer/links" />
          <ListRow icon={Store} title={copy.showcase} subtitle={copy.showcaseText} href="/trainer/showcase" />
          <ListRow icon={Dumbbell} title={copy.exercises} subtitle={copy.exercisesText} href="/trainer/exercises" />
          <ListRow icon={ClipboardList} title={copy.templates} subtitle={copy.templatesText} href="/trainer/templates" />
          <ListRow icon={ChartColumn} title={copy.analytics} subtitle={copy.analyticsText} href="/trainer/analytics" />
          <ListRow icon={ScanLine} title={t.checkIn.placesTitle} subtitle={t.checkIn.placesRowText} href="/trainer/checkin-qr" />
          <ListRow icon={Gift} title={t.referrals.title} subtitle={t.referrals.moreText} href="/trainer/referrals" />
          <ListRow
            icon={UserPlus}
            title={t.trainerReferrals.title}
            subtitle={t.trainerReferrals.moreText}
            href="/trainer/invite-trainers"
          />
        </ListGroup>
      </div>
    </Screen>
  );
}
