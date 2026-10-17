"use client";

import { Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { deleteBroadcast, sendBroadcast, setBroadcastsMuted } from "@/lib/groups/actions";
import { BROADCAST_MAX, BROADCASTS_PER_DAY, parseBroadcast } from "@/lib/groups/rules";

type ButtonKind = "none" | "deep_link" | "url";
const BUTTON_KINDS: readonly ButtonKind[] = ["none", "deep_link", "url"];

/** "Рассылка" of a group (PRD wave-2 §6.9): the text, an optional button, and today's count out of five. */
export function BroadcastComposer({ groupId, sentToday }: { groupId: string; sentToday: number }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.broadcast;
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ButtonKind>("none");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<"body" | "url" | null>(null);
  const [pending, startTransition] = useTransition();
  const full = sentToday >= BROADCASTS_PER_DAY;

  function send() {
    const button = kind === "url" ? { kind, url } : { kind };
    const parsed = parseBroadcast(body, button);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await sendBroadcast(groupId, parsed.body, parsed.button);
      if (result.ok) {
        toast.success(copy.sent);
        setBody("");
        setUrl("");
        setKind("none");
        return;
      }
      toast.error(result.reason === "limit" ? copy.limit : result.reason === "empty" ? copy.empty : copy.failed);
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <TextArea
        label={copy.text}
        hint={`${copy.textHint}, ${body.length}/${BROADCAST_MAX}`}
        error={error === "body" ? copy.textError : undefined}
        value={body}
        maxLength={BROADCAST_MAX}
        rows={5}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.button}
        </span>
        <SegmentedControl label={copy.button} value={kind} onValueChange={setKind} options={BUTTON_KINDS.map((value) => ({ value, label: copy.buttons[value] }))} />
      </div>
      {kind === "url" ? (
        <TextField
          label={copy.url}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          error={error === "url" ? copy.urlError : undefined}
          autoComplete="off"
        />
      ) : null}
      <p className="px-1 text-footnote text-ink-2" role="status">
        {full ? copy.limit : interpolate(copy.today, { count: sentToday, limit: BROADCASTS_PER_DAY })}
      </p>
      <Button type="submit" icon={Send} size="lg" block loading={pending} disabled={full}>
        {copy.send}
      </Button>
    </form>
  );
}

/** "Удалить из истории" on a sent broadcast. */
export function DeleteBroadcastButton({ broadcastId, label }: { broadcastId: string; label: string }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.broadcast;
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      icon={Trash2}
      label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteBroadcast(broadcastId);
          if (!result.ok) toast.error(copy.failed);
          else toast.success(copy.deleted);
        })
      }
    />
  );
}

/** The client's switch for one trainer's broadcasts (§6.9). */
export function BroadcastsSwitch({ coachingId, trainerName, muted }: { coachingId: string; trainerName: string; muted: boolean }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.client;
  const [on, setOn] = useState(!muted);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending}
      label={interpolate(copy.from, { name: trainerName })}
      onCheckedChange={(next) => {
        setOn(next);
        startTransition(async () => {
          const result = await setBroadcastsMuted(coachingId, !next);
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
