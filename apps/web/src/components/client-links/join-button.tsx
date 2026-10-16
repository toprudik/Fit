"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { joinTrainer, type JoinState } from "@/lib/client-links/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

const IDLE: JoinState = { status: "idle" };

/**
 * "Стать клиентом" for a link token, a typed code or a showcase the server found valid. After the
 * join the client zone opens on the trainers list with a toast and a success haptic (screens.md §4.2).
 */
export function JoinButton({ token, code, slug, trainerName }: { token?: string; code?: string; slug?: string; trainerName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState(joinTrainer, IDLE);
  const joined = state.status === "joined";

  useEffect(() => {
    if (!joined) return;
    hapticSuccess();
    toast.success(interpolate(t.clientLinks.joinedToast, { name: trainerName }));
    router.replace("/client/trainers");
  }, [joined, router, t, trainerName]);

  return (
    <form action={action} className="flex flex-col gap-3">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {code ? <input type="hidden" name="code" value={code} /> : null}
      {slug ? <input type="hidden" name="slug" value={slug} /> : null}
      {state.status === "error" ? (
        <p role="alert" className="text-subhead text-danger">
          {t.clientLinks.errors[state.reason]}
        </p>
      ) : null}
      {/* Only a failure another try may fix keeps the button. */}
      {state.status === "error" && state.reason !== "failed" ? null : (
        <>
          <Button type="submit" size="lg" block loading={pending || joined}>
            {t.clientLinks.landing.join}
          </Button>
          <p className="text-footnote text-ink-2">{t.clientLinks.landing.joinHint}</p>
        </>
      )}
    </form>
  );
}
