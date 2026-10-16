import { Search, SearchX, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { CLIENT_FILTERS, filterClients, type ClientFilter, type ClientItem } from "@/lib/pairs/clients";
import { formatDay, formatSessionTime } from "@/lib/pairs/format";
import { loadTrainerClients } from "@/lib/pairs/load";

/** The list URL with a filter and a search; "all" and an empty search stay out of it. */
export function clientsHref(filter: ClientFilter, query: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/trainer/clients?${search}` : "/trainer/clients";
}

/** One badge per row, the most pressing first: the pair state, then money, then the account. */
function rowBadge(t: Dictionary, item: ClientItem) {
  const copy = t.pairs.badges;
  if (item.status === "ended") return <Badge>{copy.ended}</Badge>;
  if (item.archived) return <Badge>{copy.archived}</Badge>;
  if (item.debtSessions > 0) return <Badge tone="danger">{interpolate(copy.debt, { count: item.debtSessions })}</Badge>;
  if (item.status === "trial") return <Badge tone="accent">{copy.trial}</Badge>;
  if (item.passEnding) return <Badge tone="warning">{interpolate(copy.left, { count: item.availableSessions })}</Badge>;
  if (item.isCard) return <Badge>{copy.card}</Badge>;
  if (!item.hasPass) return <Badge>{copy.noPass}</Badge>;
  return null;
}

/** A plain GET form, so the search works before hydration; the filter rides along. */
function SearchField({ t, filter, query }: { t: Dictionary; filter: ClientFilter; query: string }) {
  return (
    <form role="search" method="get" action="/trainer/clients">
      {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
      <label
        className={
          "flex h-11 items-center gap-2 rounded-sm border border-field-line bg-field px-3 " +
          "focus-within:border-focus-ring focus-within:shadow-[0_0_0_1px_var(--focus-ring)]"
        }
      >
        <Search aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" />
        <span className="sr-only">{t.pairs.list.searchLabel}</span>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t.pairs.list.searchLabel}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={64}
          className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
      </label>
    </form>
  );
}

type ClientListProps = {
  filter: ClientFilter;
  query: string;
  /** The open client card, highlighted on a wide screen. */
  selectedId?: string;
};

/**
 * The trainer's clients (screens.md "Клиенты", PRD wave-1 §2.5-2): search by name, filters as chips in
 * the URL, one row per pair with the next session or the start date and the most pressing badge.
 */
export async function ClientList({ filter, query, selectedId }: ClientListProps) {
  const [t, locale, loaded] = await Promise.all([getDictionary(), getLocale(), loadTrainerClients()]);
  const copy = t.pairs.list;

  if (!loaded || loaded.items.length === 0) {
    const empty = t.screens.trainer.clients;
    return (
      <EmptyState
        icon={Users}
        title={empty.emptyTitle}
        description={empty.emptyText}
        action={
          <Button asChild>
            <Link href="/trainer/links">{empty.emptyAction}</Link>
          </Button>
        }
      />
    );
  }

  const collator = new Intl.Collator(locale);
  const shown = filterClients(loaded.items, filter, query).sort((a, b) => collator.compare(a.name, b.name));

  return (
    <div className="flex flex-col gap-3 pt-2 md:pt-0">
      <SearchField t={t} filter={filter} query={query} />
      <ChipRow label={copy.filtersLabel}>
        {CLIENT_FILTERS.map((option) => (
          <Chip key={option} href={clientsHref(option, query)} selected={option === filter}>
            {copy.filters[option]}
          </Chip>
        ))}
      </ChipRow>
      {shown.length ? (
        <ListGroup className="pt-1">
          {shown.map((item) => (
            <ListRow
              key={item.coachingId}
              href={`/trainer/clients/${item.coachingId}`}
              avatar={{ name: item.name || t.botMessages.unnamedClient, src: item.photoUrl }}
              title={item.name || t.botMessages.unnamedClient}
              subtitle={
                item.nextSessionAt && item.status !== "ended"
                  ? interpolate(copy.nextSession, { date: formatSessionTime(locale, item.nextSessionAt, loaded.timeZone) })
                  : interpolate(t.clientLinks.since, { date: formatDay(locale, item.startedAt, loaded.timeZone) })
              }
              trailing={rowBadge(t, item)}
              className={item.coachingId === selectedId ? "bg-surface-3" : undefined}
            />
          ))}
        </ListGroup>
      ) : query ? (
        <EmptyState icon={SearchX} title={copy.nothingFound} description={copy.nothingFoundText} />
      ) : (
        <EmptyState
          icon={Users}
          title={copy.emptyFilter[filter]}
          description={filter === "archive" ? copy.emptyArchiveText : undefined}
          action={
            filter === "all" ? undefined : (
              <Button asChild variant="secondary">
                <Link href={clientsHref("all", "")}>{copy.showAll}</Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
