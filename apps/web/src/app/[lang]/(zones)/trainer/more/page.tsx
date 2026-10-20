import type { Metadata } from "next";
import { Award, ChartColumn, CircleHelp, ClipboardList, Dumbbell, Gift, Handshake, QrCode, Salad, ScanLine, Star, Store, Trophy, UserPlus, UserRound, Users } from "lucide-react";
import { helpPath } from "@/components/help/path";
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
          <ListRow icon={UserRound} title={t.trainerWizard.edit.open} subtitle={t.trainerWizard.edit.openText} href="/trainer/profile" />
          <ListRow icon={QrCode} iconTone="accent" title={copy.links} subtitle={copy.linksText} href="/trainer/links" />
          <ListRow icon={Store} title={copy.showcase} subtitle={copy.showcaseText} href="/trainer/showcase" />
          <ListRow icon={Award} title={t.trainerMilestones.title} subtitle={t.trainerMilestones.moreText} href="/trainer/milestones" />
          <ListRow icon={Star} title={t.reviews.trainer.title} subtitle={t.reviews.trainer.moreText} href="/trainer/reviews" />
          <ListRow icon={Dumbbell} title={copy.exercises} subtitle={copy.exercisesText} href="/trainer/exercises" />
          <ListRow icon={ClipboardList} title={copy.templates} subtitle={copy.templatesText} href="/trainer/templates" />
          <ListRow icon={Trophy} title={t.challenges.title} subtitle={t.challenges.all.moreText} href="/trainer/challenges" />
          <ListRow icon={Users} title={copy.groups} subtitle={copy.groupsText} href="/trainer/groups" />
          <ListRow icon={Handshake} title={copy.team} subtitle={copy.teamText} href="/trainer/team" />
          <ListRow icon={ChartColumn} title={copy.analytics} subtitle={copy.analyticsText} href="/trainer/analytics" />
          <ListRow icon={Salad} title={t.adherence.title} subtitle={t.adherence.moreText} href="/trainer/nutrition" />
          <ListRow icon={ScanLine} title={t.checkIn.placesTitle} subtitle={t.checkIn.placesRowText} href="/trainer/checkin-qr" />
          <ListRow icon={Gift} title={t.referrals.title} subtitle={t.referrals.moreText} href="/trainer/referrals" />
          <ListRow
            icon={UserPlus}
            title={t.trainerReferrals.title}
            subtitle={t.trainerReferrals.moreText}
            href="/trainer/invite-trainers"
          />
        </ListGroup>
        <ListGroup>
          <ListRow icon={CircleHelp} title={t.help.title} subtitle={t.help.moreText} href={helpPath("trainer")} />
        </ListGroup>
      </div>
    </Screen>
  );
}
