import { Dumbbell, Plus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries/ru";
import { getDictionary, getLocale } from "@/i18n/server";
import { EXERCISE_CATEGORIES, keyLabel } from "@/lib/workouts/catalog";
import type { LibraryQuery } from "@/lib/workouts/catalog";
import { LIBRARY_PAGE, loadLibrary } from "@/lib/workouts/load";

const PATH = "/trainer/exercises";

/** The library URL for a query: an empty search, "all" groups and "not only mine" stay out of it. */
export function libraryHref(query: LibraryQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.own) params.set("own", "1");
  const search = params.toString();
  return search ? `${PATH}?${search}` : PATH;
}

/** "+" in the header: a new exercise of the trainer's own. */
export function AddExerciseButton({ label }: { label: string }) {
  return (
    <IconButton asChild icon={Plus} label={label}>
      <Link href={`${PATH}/new`} />
    </IconButton>
  );
}

/** A plain GET form, so the search works before hydration; the group and "Мои" ride along. */
function SearchField({ t, query }: { t: Dictionary; query: LibraryQuery }) {
  const copy = t.workouts.library;
  return (
    <form role="search" method="get" action={PATH}>
      {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
      {query.own ? <input type="hidden" name="own" value="1" /> : null}
      <label
        className={
          "flex h-11 items-center gap-2 rounded-sm border border-field-line bg-field px-3 " +
          "focus-within:border-focus-ring focus-within:shadow-[0_0_0_1px_var(--focus-ring)]"
        }
      >
        <Search aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" />
        <span className="sr-only">{copy.search}</span>
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={copy.searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
      </label>
    </form>
  );
}

/**
 * The exercise library (PRD wave-1 §2.10-1..3): search in Russian and English, muscle groups and "Мои" as
 * chips, each exercise named in the user's language when it has a translation. Opens the exercise card.
 */
export async function ExerciseLibrary({ query }: { query: LibraryQuery }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.workouts.library;
  const loaded = await loadLibrary(query, locale);
  if (loaded.status === "signed-out") {
    return (
      <EmptyState
        icon={Dumbbell}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(libraryHref(query))}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchField t={t} query={query} />
      <ChipRow label={copy.filters}>
        <Chip href={libraryHref({ ...query, category: undefined, own: undefined })} selected={!query.category && !query.own}>
          {copy.all}
        </Chip>
        {loaded.status === "ok" && loaded.isTrainer ? (
          <Chip href={libraryHref({ ...query, own: query.own ? undefined : true })} selected={Boolean(query.own)}>
            {copy.own}
          </Chip>
        ) : null}
        {EXERCISE_CATEGORIES.map((category) => (
          <Chip
            key={category}
            href={libraryHref({ ...query, category: query.category === category ? undefined : category })}
            selected={query.category === category}
          >
            {t.workouts.categories[category]}
          </Chip>
        ))}
      </ChipRow>
      {loaded.status === "failed" ? (
        <EmptyState icon={Dumbbell} title={copy.title} description={copy.failed} />
      ) : loaded.items.length === 0 ? (
        query.own && !query.q && !query.category ? (
          <EmptyState
            icon={Dumbbell}
            title={copy.ownEmptyTitle}
            description={copy.ownEmptyText}
            action={
              <Button asChild icon={Plus}>
                <Link href={`${PATH}/new`}>{copy.add}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title={copy.emptyTitle}
            description={copy.emptyText}
            action={
              loaded.isTrainer ? (
                <Button asChild variant="secondary" icon={Plus}>
                  <Link href={`${PATH}/new`}>{copy.add}</Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <ListGroup>
            {loaded.items.map((item) => (
              <ListRow
                key={item.id}
                href={`${PATH}/${item.id}`}
                title={item.name}
                subtitle={
                  [
                    item.category ? keyLabel(t.workouts.categories, item.category) : null,
                    ...item.equipment.map((key) => keyLabel(t.workouts.equipment, key)),
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                trailing={item.own ? <Badge tone="accent">{copy.ownBadge}</Badge> : undefined}
              />
            ))}
          </ListGroup>
          {loaded.items.length === LIBRARY_PAGE ? (
            <p className="px-1 text-footnote text-ink-2">{interpolate(copy.more, { count: LIBRARY_PAGE })}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
