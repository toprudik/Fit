"use client";

import { Copy, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { issueShortcutToken, revokeShortcutToken } from "@/lib/activity/actions";

/**
 * The iOS Shortcuts token (wave-2 §4.3): create, reissue or revoke it. A new token is shown once, here, until the
 * page is left; the database keeps only its hash. Revoking asks first: the shortcut stops working for good.
 */
export function ShortcutToken({ token: saved }: { token: { created: string; lastUsed: string | null } | null }) {
  const { t } = useI18n();
  const copy = t.activity.shortcut;
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function issue() {
    const reissue = Boolean(saved || fresh);
    startTransition(async () => {
      const result = await issueShortcutToken();
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setFresh(result.token);
      if (reissue) toast.success(copy.reissued);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeShortcutToken();
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setFresh(null);
      setConfirming(false);
      toast.success(copy.revoked);
    });
  }

  async function copyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.failed);
    }
  }

  const exists = Boolean(saved || fresh);
  return (
    <section aria-label={copy.tokenLabel} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      {fresh ? (
        <>
          <p className="text-footnote text-ink-2">{copy.tokenLabel}</p>
          <code className="rounded-sm bg-surface-2 p-3 font-mono text-footnote break-all select-all">{fresh}</code>
          <p className="text-footnote text-ink-2">{copy.shownOnce}</p>
          <Button icon={Copy} className="self-start" onClick={() => void copyToken(fresh)}>
            {copy.copy}
          </Button>
        </>
      ) : saved ? (
        <>
          <p className="text-callout">{interpolate(copy.created, { date: saved.created })}</p>
          <p className="text-footnote text-ink-2">{saved.lastUsed ? interpolate(copy.lastUsed, { date: saved.lastUsed }) : copy.neverUsed}</p>
        </>
      ) : (
        <p className="text-callout">{copy.none}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {exists ? (
          <>
            <Button variant="secondary" loading={pending} onClick={issue}>
              {copy.reissue}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => setConfirming(true)}>
              {copy.revoke}
            </Button>
          </>
        ) : (
          <Button icon={KeyRound} loading={pending} onClick={issue}>
            {copy.create}
          </Button>
        )}
      </div>
      <Sheet
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.revokeTitle}
        description={copy.revokeText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={revoke}>
              {copy.revoke}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setConfirming(false)}>
              {copy.keep}
            </Button>
          </>
        }
      />
    </section>
  );
}
