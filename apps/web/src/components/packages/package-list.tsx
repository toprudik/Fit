"use client";

import { EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { archivePackage } from "@/lib/packages/actions";
import { PackageForm, type EditablePackage } from "./package-form";

export type PackageItem = EditablePackage & {
  /** "9 000 ₽ · 1 800 ₽ за занятие · 90 дней", already formatted. */
  terms: string;
  /** The package is in another currency than the trainer's grid. */
  otherCurrency: boolean;
};

/** One sheet for adding and editing: `null` is closed, `"new"` is a new package. */
type Editing = EditablePackage | "new" | null;

/**
 * "Все пакеты" on /trainer/money/packages: every live package with "Изменить" and "Убрать", and "Добавить
 * пакет". Removing archives the package; passes issued from it keep their own copy of the terms.
 */
export function PackageList({ packages, symbol }: { packages: PackageItem[]; symbol: string }) {
  const { t } = useI18n();
  const copy = t.money.packages;
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<PackageItem | null>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => setEditing(null), []);

  function remove(item: PackageItem) {
    startTransition(async () => {
      const { failed } = await archivePackage(item.id);
      if (failed) {
        toast.error(copy.list.actionFailed);
        return;
      }
      toast.success(copy.list.archived);
      setRemoving(null);
    });
  }

  return (
    <section aria-labelledby="all-packages" className="flex flex-col gap-3">
      <h2 id="all-packages" className="px-1 text-headline">
        {copy.list.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {packages.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-headline break-words">{item.title}</h3>
              <p className="text-subhead text-ink-2 tabular-nums">{item.terms}</p>
            </div>
            {!item.isPublic || item.otherCurrency ? (
              <div className="flex flex-wrap gap-2">
                {!item.isPublic ? (
                  <Badge icon={EyeOff} tone="neutral">
                    {copy.list.hidden}
                  </Badge>
                ) : null}
                {item.otherCurrency ? <Badge tone="warning">{copy.list.otherCurrency}</Badge> : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(item)}>
                {copy.list.edit}
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving(item)}>
                {copy.list.archive}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="lg" block icon={Plus} onClick={() => setEditing("new")}>
        {copy.form.add}
      </Button>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : close())} title={editing === "new" ? copy.form.newTitle : copy.form.editTitle}>
        {editing !== null ? (
          <PackageForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} symbol={symbol} onSaved={close} />
        ) : null}
      </Sheet>

      <Sheet
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={copy.list.archiveTitle}
        description={copy.list.archiveText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={() => removing && remove(removing)}>
              {copy.list.archive}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setRemoving(null)}>
              {copy.list.cancel}
            </Button>
          </>
        }
      />
    </section>
  );
}
