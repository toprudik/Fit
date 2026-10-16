import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { CreateInviteForm } from "@/components/trainer-invites/create-invite-form";
import { RevokeInviteButton } from "@/components/trainer-invites/revoke-invite-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.admin.invites.title };
}

type InviteStatus = keyof Dictionary["admin"]["invites"]["status"];

const STATUS_TONE = { active: "accent", redeemed: "success", expired: "neutral", revoked: "danger" } as const;

type Redeemer = { first_name: string | null; last_name: string | null; username: string | null } | null;

function redeemerName(redeemer: Redeemer, fallback: string): string {
  if (!redeemer) return fallback;
  const fullName = [redeemer.first_name, redeemer.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
  return fullName || (redeemer.username ? `@${redeemer.username}` : fallback);
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Every invite, newest first, with its status as of now. */
async function loadInvites(supabase: ServerClient) {
  // code_hash is never granted, so the columns are listed (select * fails with 42501).
  const { data, error } = await supabase
    .from("trainer_invites")
    .select(
      "id, code_hint, note, expires_at, redeemed_at, revoked_at, created_at, redeemer:profiles!trainer_invites_redeemed_by_fkey(first_name, last_name, username)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`loading trainer invites failed: ${error.code}`);

  const now = Date.now();
  return data.map((invite) => {
    const status: InviteStatus = invite.revoked_at
      ? "revoked"
      : invite.redeemed_at
        ? "redeemed"
        : invite.expires_at && new Date(invite.expires_at).getTime() <= now
          ? "expired"
          : "active";
    return { ...invite, status };
  });
}

async function InviteList() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.admin.invites;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) notFound();

  const [{ data: admin }, { data: settings }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  // The proxy already answers 404 to everyone else (ADM-12); this keeps the page closed on its own too.
  if (!admin) notFound();

  const invites = await loadInvites(supabase);
  if (!invites.length) {
    return <EmptyState icon={KeyRound} title={copy.list.emptyTitle} description={copy.list.emptyText} headingLevel={3} />;
  }

  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    timeZone: settings?.time_zone ?? "Europe/Moscow",
  });
  const date = (value: string) => dateFormat.format(new Date(value));

  return (
    <ListGroup header={copy.list.header} headingLevel={2}>
      {invites.map((invite) => {
        const { status } = invite;
        const subtitle =
          status === "redeemed"
            ? interpolate(copy.list.redeemed, { name: redeemerName(invite.redeemer, copy.list.deletedAccount), date: date(invite.redeemed_at!) })
            : interpolate(copy.list[status], {
                hint: invite.code_hint,
                date: date(status === "revoked" ? invite.revoked_at! : (invite.expires_at ?? invite.created_at)),
              });
        return (
          // Not a ListRow: the note, the status line and the button need the whole width on a phone.
          <div
            key={invite.id}
            className="relative flex flex-col gap-2 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-body leading-[22px] break-words">{invite.note ?? copy.list.noNote}</p>
              <Badge tone={STATUS_TONE[status]} className="mt-px">
                {copy.status[status]}
              </Badge>
            </div>
            <p className="text-subhead text-ink-2">{subtitle}</p>
            {status === "active" ? <RevokeInviteButton inviteId={invite.id} /> : null}
          </div>
        );
      })}
    </ListGroup>
  );
}

/**
 * Trainer invites for admins (screens.md §3.5, PRD wave-1 §4 ADM-1..3): create one with a note and a
 * validity, see its link, code and QR once, follow every invite's status, revoke an unused one.
 */
export default async function AdminInvitesPage() {
  const t = await getDictionary();
  const copy = t.admin.invites;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-4 md:pt-0">
        <section aria-labelledby="new-invite" className="flex flex-col gap-3">
          <h2 id="new-invite" className="px-4 text-footnote text-ink-2">
            {copy.create.header}
          </h2>
          <div className="rounded-lg bg-surface-1 p-4">
            <CreateInviteForm />
          </div>
        </section>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <InviteList />
        </Suspense>
      </div>
    </Screen>
  );
}
