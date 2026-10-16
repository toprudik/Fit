import { Ticket } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary, getLocale } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadClientPasses } from "@/lib/passes/load";
import { PassSummary } from "./pass-card";
import { debtText } from "@/lib/passes/debt";

/**
 * /client/passes (screens.md "Абонементы"): the client's passes by trainer, each with its debt; amounts in
 * different currencies stay apart (§2.8 edge cases). A pass opens its own screen.
 */
export async function ClientPasses() {
  const [t, locale, groups] = await Promise.all([getDictionary(), getLocale(), loadClientPasses()]);
  const copy = t.money.client;
  if (!groups?.length) return <EmptyState icon={Ticket} title={copy.emptyTitle} description={copy.emptyText} />;
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.coachingId} aria-labelledby={`trainer-${group.coachingId}`} className="flex flex-col gap-2">
          <h2 id={`trainer-${group.coachingId}`} className="px-1 text-headline">
            {interpolate(copy.trainer, { name: group.trainerName || t.botMessages.unnamedTrainer })}
          </h2>
          {group.debt.sessions > 0 ? (
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-subhead text-danger">
              {interpolate(copy.debt, { debt: debtText(t, locale, group.debt) })}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {group.passes.map((pass) => (
              <li key={pass.id}>
                <Link href={`/client/passes/${pass.id}`} className="block rounded-lg hover:opacity-90">
                  <PassSummary pass={pass} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
