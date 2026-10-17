import type { Metadata } from "next";
import { Archive, BellRing, CalendarX, ShieldOff, Trash2, UserX, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { CancelDeletion } from "@/components/account/cancel-deletion";
import { DeleteForm } from "@/components/account/delete-form";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { EXPORT_PATH } from "@/lib/account/deletion";
import { loadDeletion } from "@/lib/account/load";
import { formatPlanDate } from "@/lib/plans/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.account.delete.title };
}

/** Sentences with an icon each, wrapped in full: these rows are read, not pressed, so nothing is cut off. */
function Consequences({ id, header, items }: { id: string; header: string; items: { icon: LucideIcon; text: string; note?: string }[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-4 text-footnote text-ink-2">
        {header}
      </h2>
      <ul className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        {items.map(({ icon: Icon, text, note }) => (
          <li key={text} className="flex gap-3">
            <span aria-hidden className="grid size-7.5 shrink-0 place-items-center rounded-xs bg-surface-3 text-ink">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <span className="flex flex-col gap-0.5 pt-1">
              <span className="text-body">{text}</span>
              {note ? <span className="text-footnote text-ink-2">{note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Deletion() {
  const [t, locale, deletion] = await Promise.all([getDictionary(), getLocale(), loadDeletion()]);
  const copy = t.account.delete;
  if (!deletion) return <EmptyState icon={UserX} title={copy.signedOut} />;
  const exportRow = <ListRow icon={Archive} title={copy.openExport} href={EXPORT_PATH} />;

  // During the 30 days this is the only screen besides the export (src/proxy.ts): the date and a way back.
  if (deletion.scheduledFor) {
    return (
      <div className="flex flex-col gap-6">
        <section aria-labelledby="deletion-pending" className="flex flex-col gap-2 rounded-lg bg-danger-soft p-4">
          <h2 id="deletion-pending" className="text-headline">
            {interpolate(copy.pendingTitle, { date: formatPlanDate(locale, deletion.scheduledFor, deletion.timeZone) })}
          </h2>
          <p className="text-callout">{copy.pendingText}</p>
          {deletion.trainer ? <p className="text-callout">{copy.pendingTrainer}</p> : null}
        </section>
        <CancelDeletion />
        <ListGroup>{exportRow}</ListGroup>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="px-4 text-body text-ink-2">{copy.lead}</p>
      <Consequences
        id="deletion-now"
        header={copy.now}
        items={[
          {
            icon: CalendarX,
            text: copy.bookingsCancelled,
            note: deletion.upcoming ? interpolate(copy.bookingsCount, { count: String(deletion.upcoming) }) : undefined,
          },
          ...(deletion.trainers.length ? [{ icon: BellRing, text: interpolate(copy.trainersTold, { names: deletion.trainers.join(", ") }) }] : []),
          ...(deletion.trainer ? [{ icon: BellRing, text: copy.clientsTold }] : []),
        ]}
      />
      <Consequences
        id="deletion-later"
        header={copy.later}
        items={[
          { icon: Trash2, text: copy.personalGone },
          { icon: ShieldOff, text: copy.trainersKeep },
          ...(deletion.trainer ? [{ icon: ShieldOff, text: copy.clientsKeep }] : []),
        ]}
      />
      <ListGroup header={copy.exportFirst}>{exportRow}</ListGroup>
      <DeleteForm />
    </div>
  );
}

/**
 * Account deletion (screens.md /settings/delete, PRD wave-1 §2.12-7, PRIV-7): what happens now and in 30 days,
 * a typed confirmation and the destructive button. With a pending request it shows the date and "Отменить
 * удаление" instead.
 */
export default async function DeleteAccountPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.account.delete.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 pb-8 md:pt-0">
        <Suspense fallback={<SkeletonRows label={t.common.loading} />}>
          <Deletion />
        </Suspense>
      </div>
    </Screen>
  );
}
