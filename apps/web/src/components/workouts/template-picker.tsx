"use client";

import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import type { TemplateItem } from "@/lib/workouts/template";
import { pickableTemplates, templateForLog } from "@/lib/workouts/template-actions";

type Pickable = Awaited<ReturnType<typeof pickableTemplates>>;

/** "Выбери шаблон": the trainer's templates; picking one loads its plan for the log (WORK-5). */
export function TemplatePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (template: { id: string; title: string; items: TemplateItem[] }) => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.workouts.templates;
  const [templates, setTemplates] = useState<Pickable | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!open || templates) return;
    let current = true;
    pickableTemplates().then((found) => current && setTemplates(found));
    return () => {
      current = false;
    };
  }, [open, templates]);

  async function pick(id: string) {
    setLoading(id);
    const template = await templateForLog({ id, locale });
    setLoading(null);
    if (template) onPick({ id, ...template });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={copy.pickTitle}>
      <div className="flex flex-col gap-4 pb-2">
        {templates === null ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-subhead text-ink-2">
            <Spinner />
            {t.common.loading}
          </div>
        ) : templates.length === 0 ? (
          <p className="px-1 py-4 text-subhead text-ink-2">{copy.pickEmpty}</p>
        ) : (
          <ListGroup surface="raised" headingLevel={3}>
            {templates.map((template) => (
              <ListRow
                key={template.id}
                icon={ClipboardList}
                title={template.title}
                subtitle={plural(locale, template.exercises, copy.count)}
                trailing={loading === template.id ? <Spinner /> : undefined}
                onClick={() => void pick(template.id)}
                chevron={false}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </Sheet>
  );
}
