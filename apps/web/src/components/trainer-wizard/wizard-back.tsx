"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/i18n/client";
import { useTelegramBackButton } from "@/lib/telegram/mini-app";

/** Back to the previous step: a button on the page, and Telegram's own BackButton inside the Mini App. */
export function WizardBack({ href }: { href: string }) {
  const { t } = useI18n();
  const router = useRouter();
  useTelegramBackButton(() => router.push(href));
  return (
    <IconButton asChild icon={ChevronLeft} label={t.common.back} className="-ml-3">
      <Link href={href} />
    </IconButton>
  );
}
