import type { Metadata } from "next";
import { Archive, UserX } from "lucide-react";
import { Suspense } from "react";
import { ExportDownload } from "@/components/account/export-download";
import { ExportRequest } from "@/components/account/export-request";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadExports } from "@/lib/account/load";
import { formatPlanDate } from "@/lib/plans/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.account.export.title };
}

async function Exports() {
  const [t, locale, exports] = await Promise.all([getDictionary(), getLocale(), loadExports()]);
  const copy = t.account.export;
  if (!exports) return <EmptyState icon={UserX} title={copy.signedOut} />;
  const date = (value: string) => formatPlanDate(locale, value, exports.timeZone);
  const busy = exports.rows.some((row) => row.status === "queued" || row.status === "processing");

  return (
    <>
      <ExportRequest busy={busy} />
      {exports.rows.length ? (
        <ListGroup header={copy.history}>
          {exports.rows.map((row) => (
            <ListRow
              key={row.id}
              icon={Archive}
              iconTone={row.parts.length ? "accent" : "default"}
              title={row.status === "ready" && row.expiresAt ? interpolate(copy.status.ready, { date: date(row.expiresAt) }) : copy.status[row.status]}
              subtitle={
                <span className="flex flex-col gap-2">
                  <span>{interpolate(copy.requestedOn, { date: date(row.requestedAt) })}</span>
                  {row.parts.length ? <ExportDownload parts={row.parts} /> : null}
                </span>
              }
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState icon={Archive} title={copy.emptyTitle} />
      )}
    </>
  );
}

/**
 * Data export (screens.md /settings/export, PRD wave-1 §2.12-6, PRIV-6): request an archive of everything, see
 * past requests and download a ready one. The bot also says when it is ready.
 */
export default async function ExportPage() {
  const t = await getDictionary();
  const copy = t.account.export;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 pb-8 md:pt-0">
        <div className="flex flex-col gap-2 px-4">
          <p className="text-body">{copy.lead}</p>
          <p className="text-callout text-ink-2">{copy.when}</p>
        </div>
        <Suspense fallback={<SkeletonRows label={t.common.loading} />}>
          <Exports />
        </Suspense>
      </div>
    </Screen>
  );
}
