import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Live pairs of the signed-in user on one side: the trainer's clients or the client's trainers, with
 * the date they started. A first, plain version for the client link flow; the pair cards
 * (/trainer/clients/[id], /client/trainers/[id]) come with their own feature. Renders `empty` when
 * there is no session or no pair, and `after` under the list when there is one.
 */
export async function PairList({ side, empty, after }: { side: "trainer" | "client"; empty: React.ReactNode; after?: React.ReactNode }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return empty;

  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, trainer_id, client_id, started_at")
    .eq(side === "trainer" ? "trainer_id" : "client_id", userId)
    .in("status", ["trial", "active"])
    .order("started_at", { ascending: false });
  if (error) throw new Error(`loading pairs failed: ${error.code}`);
  if (!pairs.length) return empty;

  const partnerIds = pairs.map((pair) => (side === "trainer" ? pair.client_id : pair.trainer_id));
  // telegram_id is not granted, so the columns are listed.
  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, username, photo_url")
    .in("id", partnerIds);
  if (peopleError) throw new Error(`loading pair partners failed: ${peopleError.code}`);
  const byId = new Map(people.map((person) => [person.id, person]));

  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <ListGroup className="pt-4 md:pt-0">
        {pairs.map((pair) => {
          const person = byId.get(side === "trainer" ? pair.client_id : pair.trainer_id);
          const name =
            personName(person?.first_name, person?.last_name) || (person?.username ? `@${person.username}` : t.botMessages.unnamedClient);
          return (
            <ListRow
              key={pair.id}
              avatar={{ name, src: person?.photo_url }}
              title={name}
              subtitle={interpolate(t.clientLinks.since, {
                date: dateFormat.format(new Date(pair.started_at)),
              })}
            />
          );
        })}
      </ListGroup>
      {after}
    </>
  );
}
