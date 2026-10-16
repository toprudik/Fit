import type { Metadata } from "next";
import { Search, UserX } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminShell.users.title };
}

type SearchParams = PageProps<"/[lang]/admin/users">["searchParams"];

async function UserSearch({ searchParams }: { searchParams: SearchParams }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const copy = t.adminShell.users;
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const { supabase } = await requireAdmin();
  const { data: users, error } = await supabase.rpc("admin_search_users", { p_query: query || undefined, p_limit: 50 });
  if (error) throw new Error(`searching users failed: ${error.code}`);

  return (
    <div className="flex flex-col gap-8">
      {/* A plain GET form: the query lives in the URL, so a search can be reloaded and shared between admins. */}
      <form role="search" method="get" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        <TextField name="q" type="search" label={copy.searchLabel} hint={copy.searchHint} defaultValue={query} maxLength={100} autoComplete="off" />
        <div>
          <Button type="submit" size="sm" variant="secondary" icon={Search}>
            {copy.search}
          </Button>
        </div>
      </form>
      {users.length === 0 ? (
        <EmptyState icon={UserX} title={copy.emptyTitle} description={copy.emptyText} />
      ) : (
        <ListGroup header={query ? copy.results : copy.newest} headingLevel={2}>
          {users.map((user) => {
            const name = personName(user, copy.noName);
            return (
              <ListRow
                key={user.user_id}
                href={`/admin/users/${user.user_id}`}
                avatar={{ name, src: user.photo_url }}
                title={name}
                subtitle={[user.username ? `@${user.username}` : null, interpolate(copy.telegramId, { id: String(user.telegram_id) })]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  user.blocked || user.is_admin || user.is_trainer ? (
                    // On a phone only the block shows; the roles are on the card.
                    <span className="flex shrink-0 gap-1">
                      {user.blocked ? <Badge tone="danger">{copy.badges.blocked}</Badge> : null}
                      {user.is_admin ? <Badge tone="accent" className="max-sm:hidden">{copy.badges.admin}</Badge> : null}
                      {user.is_trainer ? <Badge className="max-sm:hidden">{copy.badges.trainer}</Badge> : null}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </ListGroup>
      )}
    </div>
  );
}

/** «Пользователи» (screens.md §3.5): search by name, @username or Telegram ID; an empty search lists the newest. */
export default async function AdminUsersPage(props: PageProps<"/[lang]/admin/users">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminShell.users.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <UserSearch searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
