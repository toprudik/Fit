"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { requestDataExport } from "@/lib/account/actions";

/** "Запросить экспорт": queues the archive; the bot writes when it is ready (PRIV-6). */
export function ExportRequest({ busy }: { busy: boolean }) {
  const { t } = useI18n();
  const copy = t.account.export;
  const [pending, startTransition] = useTransition();

  function request() {
    startTransition(async () => {
      const result = await requestDataExport();
      if (result.ok) toast.success(copy.requested);
      else toast.error(copy.failed);
    });
  }

  return (
    <Button size="lg" block icon={Archive} loading={pending} disabled={busy} onClick={request}>
      {copy.request}
    </Button>
  );
}
