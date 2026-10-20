"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { intakeConsentPath } from "@/lib/intake/paths";
import { joinInvitedTrainer, type JoinInvitedState } from "@/lib/trainer-inviters/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

const IDLE: JoinInvitedState = { status: "idle" };

/**
 * "Заниматься" next to a trainer who came by the user's link: the same ending as "Стать клиентом" on a trainer's
 * link, a toast and a success haptic, then the intake consent step of the new pair (screens.md §4.2, flow 4a).
 */
export function JoinInvitedButton({ trainerId, trainerName }: { trainerId: string; trainerName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState(joinInvitedTrainer, IDLE);
  const coachingId = state.status === "joined" ? state.coachingId : null;
  const error = state.status === "error" ? state.reason : null;

  useEffect(() => {
    if (!coachingId) return;
    hapticSuccess();
    toast.success(interpolate(t.clientLinks.joinedToast, { name: trainerName }));
    router.replace(intakeConsentPath(coachingId));
  }, [coachingId, router, t, trainerName]);

  useEffect(() => {
    if (error) toast.error(error === "notInvited" ? t.trainerInviter.notInvited : t.clientLinks.errors[error]);
  }, [error, state, t]);

  return (
    <form action={action}>
      <input type="hidden" name="trainer" value={trainerId} />
      <Button type="submit" size="sm" loading={pending || coachingId !== null}>
        {t.trainerInviter.join}
      </Button>
    </form>
  );
}
