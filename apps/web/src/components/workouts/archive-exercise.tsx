"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { setExerciseArchived } from "@/lib/workouts/actions";

/** "Убрать в архив" / "Вернуть из архива" on the card of an own exercise. */
export function ArchiveExercise({ id, archived }: { id: string; archived: boolean }) {
  const { t } = useI18n();
  const copy = t.workouts.card;
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setExerciseArchived({ id, archived: !archived });
      if (result.ok) toast.success(archived ? copy.restoredToast : copy.archivedToast);
      else toast.error(copy.failed);
    });
  }

  return (
    <Button variant="secondary" icon={archived ? ArchiveRestore : Archive} loading={pending} onClick={toggle} block>
      {archived ? copy.restore : copy.archive}
    </Button>
  );
}
