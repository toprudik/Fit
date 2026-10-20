"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/client";
import { setAppOpensCounted } from "@/lib/analytics/actions";

/** "Учитывать мои открытия": applies at once, like the other switches in settings. */
export function AppOpensSwitch({ counted }: { counted: boolean }) {
  const { t } = useI18n();
  const copy = t.appOpens;
  const [on, setOn] = useState(counted);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending}
      label={copy.label}
      showLabel
      hint={copy.hint}
      onCheckedChange={(next) => {
        setOn(next);
        startTransition(async () => {
          const result = await setAppOpensCounted(next);
          if (!result.ok) {
            setOn(!next);
            toast.error(copy.failed);
            return;
          }
          toast.success(next ? copy.on : copy.off);
        });
      }}
    />
  );
}
