import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { displayName } from "@/lib/pairs/clients";
import { formatDay } from "@/lib/pairs/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in client's live pairs, each opening its card /client/trainers/[coachingId], with the day
 * they started. Renders `empty` when there is no session or no pair, and `after` under the list.
 */
export async function PairList({ empty, after }: { empty: React.ReactNode; after?: React.ReactNode }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return empty;

  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, trainer_id, started_at")
    .eq("client_id", userId)
    .in("status", ["trial", "active"])
    .order("started_at", { ascending: false });
  if (error) throw new Error(`loading pairs failed: ${error.code}`);
  if (!pairs.length) return empty;

  // telegram_id is not granted, so the columns are listed.
  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, username, photo_url, time_zone")
    .in(
      "id",
      pairs.map((pair) => pair.trainer_id),
    );
  if (peopleError) throw new Error(`loading pair partners failed: ${peopleError.code}`);
  const byId = new Map(people.map((person) => [person.id, person]));

  return (
    <>
      <ListGroup className="pt-4 md:pt-0">
        {pairs.map((pair) => {
          const person = byId.get(pair.trainer_id);
          const name = displayName(person) || t.botMessages.unnamedTrainer;
          // The day the pair started in the trainer's zone, the same day the trainer sees.
          const since = formatDay(locale, pair.started_at, person?.time_zone ?? "Europe/Moscow");
          return (
            <ListRow
              key={pair.id}
              href={`/client/trainers/${pair.id}`}
              avatar={{ name, src: person?.photo_url }}
              title={name}
              subtitle={interpolate(t.clientLinks.since, { date: since })}
            />
          );
        })}
      </ListGroup>
      {after}
    </>
  );
}
