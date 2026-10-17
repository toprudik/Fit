"use client";

import { useCallback } from "react";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import type { MoneyResult } from "@/lib/passes/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

/** Turns an action result into a toast; true when it went through. */
export function useReport() {
  const { t } = useI18n();
  return useCallback(
    (result: MoneyResult, done: string, refused?: string): boolean => {
      if (result.status === "done") {
        hapticSuccess();
        toast.success(done);
        return true;
      }
      if (result.status === "refused" && refused) toast.error(refused);
      else if (result.status === "stale") toast.error(t.money.passes.stale);
      else if (result.status !== "invalid") toast.error(t.money.passes.failed);
      return false;
    },
    [t],
  );
}
