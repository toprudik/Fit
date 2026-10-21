import type { Metadata } from "next";
import { Screen } from "@/components/shell/screen";
import { TRAINER_HELP_ITEM, TRAINER_MORE_ITEMS } from "@/components/shell/nav-items";
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
          {TRAINER_MORE_ITEMS.map((item) => (
            <ListRow
              key={item.href}
              icon={item.icon}
              iconTone={item.accent ? "accent" : undefined}
              title={item.title(t)}
              subtitle={item.subtitle(t)}
              href={item.href}
            />
          ))}
        </ListGroup>
        <ListGroup>
          <ListRow icon={TRAINER_HELP_ITEM.icon} title={TRAINER_HELP_ITEM.title(t)} subtitle={TRAINER_HELP_ITEM.subtitle(t)} href={TRAINER_HELP_ITEM.href} />
        </ListGroup>
      </div>
    </Screen>
  );
}
