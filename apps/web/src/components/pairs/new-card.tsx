import { Link2 } from "lucide-react";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary } from "@/i18n/server";
import { loadClientLimit } from "@/lib/pairs/load";
import { NewCardForm } from "./new-card-form";

/**
 * "Добавить клиента вручную" (screens.md /trainer/clients/new, PRD wave-1 §2.5-3): the client link first,
 * then the card form. A Free trainer with every place taken sees the Pro lock instead (§2.14-3).
 */
export async function NewCard() {
  const [t, limit] = await Promise.all([getDictionary(), loadClientLimit()]);
  const copy = t.pairs.cards;

  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/clients" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-3 md:pt-0">
        <ListGroup>
          <ListRow icon={Link2} iconTone="accent" title={copy.inviteTitle} subtitle={copy.inviteText} href="/trainer/links" />
        </ListGroup>
        {limit?.full ? (
          <TierLock
            plan="trainer_pro"
            title={copy.limitTitle}
            description={copy.limitText}
            feature="trainer.unlimited_clients"
            requested={limit.requested}
          />
        ) : (
          <section aria-labelledby="new-card" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 px-1">
              <h2 id="new-card" className="text-headline">
                {copy.manualHeader}
              </h2>
              <p className="text-callout text-ink-2">{copy.explanation}</p>
            </div>
            <NewCardForm />
          </section>
        )}
      </div>
    </Screen>
  );
}
