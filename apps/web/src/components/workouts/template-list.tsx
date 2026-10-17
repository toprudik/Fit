import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { buttonVariants } from "@/components/ui/button";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/format";
import { loadTemplates } from "@/lib/workouts/templates";

export const TEMPLATES_PATH = "/trainer/templates";

export function AddTemplateButton({ label }: { label: string }) {
  return (
    <IconButton asChild icon={Plus} label={label}>
      <Link href={`${TEMPLATES_PATH}/new`} />
    </IconButton>
  );
}

/** The trainer's workout templates (PRD wave-1 §2.10-7), the archived ones in their own group. */
export async function TemplateList() {
  const [t, locale, templates] = await Promise.all([getDictionary(), getLocale(), loadTemplates()]);
  const copy = t.workouts.templates;
  if (templates === null) return <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{t.workouts.logs.failed}</p>;
  if (!templates.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={copy.emptyTitle}
        description={copy.emptyText}
        action={
          <Link href={`${TEMPLATES_PATH}/new`} className={buttonVariants()}>
            {copy.new}
          </Link>
        }
      />
    );
  }
  const row = (template: (typeof templates)[number]) => (
    <ListRow
      key={template.id}
      icon={ClipboardList}
      title={template.title}
      subtitle={plural(locale, template.exercises, copy.count)}
      href={`${TEMPLATES_PATH}/${template.id}`}
    />
  );
  const archived = templates.filter((template) => template.archived);
  return (
    <div className="flex flex-col gap-6">
      <ListGroup>{templates.filter((template) => !template.archived).map(row)}</ListGroup>
      {archived.length ? <ListGroup header={copy.archivedHeader}>{archived.map(row)}</ListGroup> : null}
    </div>
  );
}
