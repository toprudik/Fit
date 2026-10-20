import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { isClientCount, LANDING_PATH } from "@/lib/waitlist/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminWaitlist.title };
}

const PAGE = 200;

async function Entries() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.adminWaitlist;
  const { supabase, timeZone } = await requireAdmin();
  const { data, error, count } = await supabase
    .from("trainer_waitlist")
    .select("id, user_id, name, contact, clients, locale, source, created_at, profile:profiles(username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) throw new Error(`loading the trainer waitlist failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });

  if (data.length === 0) return <EmptyState icon={ClipboardList} title={copy.emptyTitle} description={copy.emptyText} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-subhead text-ink-2">{interpolate(copy.count, { n: count ?? data.length })}</p>
      <ListGroup>
        {data.map((entry) => {
          // A signed-in entry without a contact is reached through the account's Telegram username.
          const contact = entry.contact ?? (entry.profile?.username ? `@${entry.profile.username}` : copy.noContact);
          return (
            <ListRow
              key={entry.id}
              title={entry.name || copy.noName}
              subtitle={[
                contact,
                isClientCount(entry.clients) ? copy.clients[entry.clients] : null,
                entry.source ? interpolate(copy.source, { source: entry.source }) : null,
                entry.locale.toUpperCase(),
                date.format(new Date(entry.created_at)),
              ]
                .filter(Boolean)
                .join(", ")}
              trailing={entry.user_id ? <Badge>{copy.signedIn}</Badge> : undefined}
            />
          );
        })}
      </ListGroup>
    </div>
  );
}

/** «Лист ожидания» in /admin (marketing backlog item 10): trainers who joined on /for-trainers, newest first. */
export default async function AdminWaitlistPage() {
  const t = await getDictionary();
  const copy = t.adminWaitlist;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{copy.intro}</p>
        <Button asChild variant="secondary" className="self-start">
          <Link href={LANDING_PATH}>{copy.openLanding}</Link>
        </Button>
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Entries />
        </Suspense>
      </div>
    </Screen>
  );
}
