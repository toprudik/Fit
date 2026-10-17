"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { joinChallenge, leaveChallenge, setChallengeLeaderboard } from "@/lib/challenges/actions";
import { CHALLENGE_ALIAS_MAX, type ChallengeShare } from "@/lib/challenges/challenges";
import { sharingPath } from "@/lib/sharing/categories";
import { cn } from "@/lib/utils";

/** The leaderboard switch and the alias, shared by joining and by the settings of a participant. */
function LeaderboardFields({
  show,
  onShow,
  alias,
  onAlias,
  aliasError,
}: {
  show: boolean;
  onShow: (next: boolean) => void;
  alias: string;
  onAlias: (next: string) => void;
  aliasError: boolean;
}) {
  const { t } = useI18n();
  const copy = t.challenges.client;
  return (
    <>
      <Switch checked={show} onCheckedChange={onShow} label={copy.showOnBoard} hint={copy.showOnBoardHint} showLabel />
      {show ? (
        <TextField
          label={copy.alias}
          hint={copy.aliasHint}
          value={alias}
          maxLength={CHALLENGE_ALIAS_MAX}
          onChange={(event) => onAlias(event.target.value)}
          error={aliasError ? copy.aliasError : undefined}
          autoComplete="off"
        />
      ) : null}
    </>
  );
}

/**
 * "Участвовать" (wave-3 §2.3-11): the client joins on their own, the leaderboard off unless they turn it on
 * (Q40). Without the metric's share the database refuses, and the screen sends them to "Доступ к данным".
 */
export function JoinChallenge({
  challengeId,
  coachingId,
  share,
  shared,
  leaderboard,
}: {
  challengeId: string;
  coachingId: string;
  share: ChallengeShare;
  shared: boolean;
  leaderboard: boolean;
}) {
  const { t } = useI18n();
  const copy = t.challenges.client;
  const [show, setShow] = useState(false);
  const [alias, setAlias] = useState("");
  const [aliasError, setAliasError] = useState(false);
  const [needsShare, setNeedsShare] = useState(!shared);
  const [pending, startTransition] = useTransition();

  if (needsShare) {
    return (
      <div className="flex flex-col gap-3 px-1">
        <p className="text-callout">{interpolate(copy.shareNeeded, { category: copy.shares[share] })}</p>
        <Link href={sharingPath(coachingId)} className={cn(buttonVariants({ variant: "secondary" }), "self-start")}>
          {copy.openSharing}
        </Link>
      </div>
    );
  }

  function join() {
    if (alias.trim().length > CHALLENGE_ALIAS_MAX) {
      setAliasError(true);
      return;
    }
    setAliasError(false);
    startTransition(async () => {
      const result = await joinChallenge({ challengeId, showOnLeaderboard: leaderboard && show, alias: show ? alias : null });
      if (result.ok) {
        toast.success(copy.joinedToast);
        return;
      }
      if (result.reason === "share_needed") setNeedsShare(true);
      else toast.error(result.reason === "closed" ? copy.closed : copy.failed);
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        join();
      }}
    >
      <p className="px-1 text-callout text-ink-2">{copy.joinText}</p>
      {leaderboard ? <LeaderboardFields show={show} onShow={setShow} alias={alias} onAlias={setAlias} aliasError={aliasError} /> : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.join}
      </Button>
    </form>
  );
}

/** "Лидерборд и псевдоним" of a participant: show or hide themselves at any time (§2.4-16). */
export function LeaderboardSettings({ challengeId, show, alias }: { challengeId: string; show: boolean; alias: string | null }) {
  const { t } = useI18n();
  const copy = t.challenges.client;
  const [open, setOpen] = useState(false);
  const [nextShow, setNextShow] = useState(show);
  const [nextAlias, setNextAlias] = useState(alias ?? "");
  const [aliasError, setAliasError] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    if (nextAlias.trim().length > CHALLENGE_ALIAS_MAX) {
      setAliasError(true);
      return;
    }
    setAliasError(false);
    startTransition(async () => {
      const result = await setChallengeLeaderboard({ challengeId, show: nextShow, alias: nextShow ? nextAlias : null });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      toast.success(copy.saved);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setNextShow(show);
          setNextAlias(alias ?? "");
          setAliasError(false);
          setOpen(true);
        }}
      >
        {copy.settings}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={copy.settings}
        actions={
          <Button size="lg" block loading={pending} onClick={save}>
            {copy.save}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <LeaderboardFields show={nextShow} onShow={setNextShow} alias={nextAlias} onAlias={setNextAlias} aliasError={aliasError} />
        </div>
      </Sheet>
    </>
  );
}

/** "Выйти из челленджа" after a confirmation. */
export function LeaveChallenge({ challengeId, title }: { challengeId: string; title: string }) {
  const { t } = useI18n();
  const copy = t.challenges.client;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {copy.leave}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={interpolate(copy.leaveTitle, { title })}
        description={copy.leaveText}
        actions={
          <Button
            variant="destructive"
            size="lg"
            block
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await leaveChallenge(challengeId);
                if (!result.ok) {
                  toast.error(copy.failed);
                  return;
                }
                toast.success(copy.left);
                setOpen(false);
              })
            }
          >
            {copy.leaveConfirm}
          </Button>
        }
      />
    </>
  );
}
