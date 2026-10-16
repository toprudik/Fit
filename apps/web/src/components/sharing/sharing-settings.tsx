"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/client";
import { setShare } from "@/lib/sharing/actions";
import { SHARE_CATEGORIES, type ShareCategory, type Shares } from "@/lib/sharing/categories";

/** The switches of "Доступ к данным": each one applies at once and only to this pair's trainer (PRIV-4). */
export function SharingSwitches({ coachingId, shares }: { coachingId: string; shares: Shares }) {
  const { t } = useI18n();
  const copy = t.sharing;
  const [optimistic, setOptimistic] = useOptimistic(shares, (current, change: { category: ShareCategory; shared: boolean }) => ({
    ...current,
    [change.category]: change.shared,
  }));
  const [, startTransition] = useTransition();

  function toggle(category: ShareCategory, shared: boolean) {
    startTransition(async () => {
      setOptimistic({ category, shared });
      const result = await setShare({ coachingId, category, shared });
      if (!result.ok) toast.error(copy.failed);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      {SHARE_CATEGORIES.map((category) => (
        <Switch
          key={category}
          showLabel
          label={copy.categories[category].label}
          hint={copy.categories[category].hint}
          checked={optimistic[category]}
          onCheckedChange={(next) => toggle(category, next)}
        />
      ))}
    </div>
  );
}
