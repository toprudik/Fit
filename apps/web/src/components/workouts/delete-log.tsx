"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { deleteWorkoutLog } from "@/lib/workouts/log-actions";

/** "Удалить тренировку" with a confirmation; then back to the list it came from. */
export function DeleteLog({ id, listHref }: { id: string; listHref: string }) {
  const { t } = useI18n();
  const copy = t.workouts.logs;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteWorkoutLog(id);
      if (!result.ok) {
        toast.error(copy.deleteFailed);
        return;
      }
      toast.success(copy.deleted);
      setOpen(false);
      router.replace(listHref);
    });
  }

  return (
    <>
      <Button variant="destructive" icon={Trash2} onClick={() => setOpen(true)} block>
        {copy.delete}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.deleteTitle}
        description={copy.deleteText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={remove}>
              {copy.deleteConfirm}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </>
  );
}
