"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { LEGAL_PATH } from "@/lib/legal/documents";

/**
 * What a blocked person sees at sign-in (ADM-7): the block, the admin's reason or a general line when there is
 * none, and where to appeal (user agreement 15, terms 22). The agreement holds the address, so this screen does
 * not change when the address does.
 */
export function BlockedNotice({ reason }: { reason: string | null }) {
  const { t } = useI18n();
  const copy = t.login.blockedNotice;
  return (
    <div role="alert" className="flex flex-col gap-2 text-subhead">
      <p className="text-danger">{copy.title}</p>
      <p className="break-words">{reason ? interpolate(copy.reason, { reason }) : copy.noReason}</p>
      <p className="text-ink-2">{copy.appeal}</p>
      <Link href={`${LEGAL_PATH}/terms`} className="self-start text-accent-ink underline underline-offset-2">
        {copy.terms}
      </Link>
    </div>
  );
}
