import type { Metadata } from "next";
import { Suspense } from "react";
import { ADMIN_SECTIONS } from "@/components/admin/admin-nav";
import { DocumentsAnnounce } from "@/components/admin/documents-announce";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin/require-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminShell.overview.title };
}

async function Counts() {
  const t = await getDictionary();
  const copy = t.adminShell.overview;
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_overview").single();
  if (error) throw new Error(`loading the overview failed: ${error.code}`);

  const rows: { label: string; value: number; href?: string }[] = [
    { label: copy.users, value: data.users, href: "/admin/users" },
    { label: copy.trainers, value: data.trainers },
    { label: copy.trainersPending, value: data.trainers_pending, href: "/admin/verification" },
    { label: copy.trainersVerified, value: data.trainers_verified },
    { label: copy.activeInvites, value: data.active_invites, href: "/admin/invites" },
    { label: copy.activePairs, value: data.active_pairs },
    { label: copy.blockedUsers, value: data.blocked_users },
  ];
  return (
    <ListGroup header={copy.header} footer={copy.metricsNote} headingLevel={2}>
      {rows.map((row) => (
        <ListRow key={row.label} title={row.label} value={row.value} href={row.href} />
      ))}
    </ListGroup>
  );
}

/**
 * The admin's start page, «Обзор беты» (screens.md §3.5): counts of the beta as of now. Activity metrics
 * (WAU trainers, opens from reminders, NPS) need sessions and feedback, which come in later waves. Below them,
 * «Объявить новые редакции документов» (право 15). On a phone, where there is no side menu, it also lists the sections.
 */
export default async function AdminOverviewPage() {
  const t = await getDictionary();
  const copy = t.adminShell;
  return (
    <Screen header={<ScreenHeader title={copy.overview.title} back={{ fallbackHref: "/" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={7} label={t.common.loading} />}>
          <Counts />
        </Suspense>
        <section aria-labelledby="documents-update" className="flex flex-col gap-3">
          <h2 id="documents-update" className="px-1 text-headline">
            {copy.documents.header}
          </h2>
          <p className="px-1 text-callout text-ink-2">{copy.documents.lead}</p>
          <DocumentsAnnounce />
        </section>
        <ListGroup header={copy.overview.sections} headingLevel={2} className="md:hidden">
          {ADMIN_SECTIONS.filter((section) => section.segment !== null).map(({ id, href, icon }) => (
            <ListRow key={id} icon={icon} title={copy.sections[id]} href={href} />
          ))}
        </ListGroup>
      </div>
    </Screen>
  );
}
