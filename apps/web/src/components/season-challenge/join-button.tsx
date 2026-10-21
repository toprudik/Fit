"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { setSeasonChallengeJoined } from "@/lib/season-challenge/actions";

/** «Участвовать» or «Выйти» on the season challenge card; the card shows the new state after refresh(). */
export function SeasonJoinButton({ id, joined }: { id: string; joined: boolean }) {
  const { t } = useI18n();
  const copy = t.seasonChallenge;
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setSeasonChallengeJoined(id, !joined);
      if (result.ok) toast.success(joined ? copy.left : copy.joinedToast);
      else toast.error(result.reason === "closed" ? copy.closed : copy.failed);
    });
  }

  return (
    <Button type="button" variant={joined ? "secondary" : "primary"} loading={pending} onClick={toggle} className="self-start">
      {joined ? copy.leave : copy.join}
    </Button>
  );
}
