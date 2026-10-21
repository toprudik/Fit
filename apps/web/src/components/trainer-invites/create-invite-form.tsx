"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { createTrainerInvite, type CreateInviteState } from "@/lib/trainer-invites/admin-actions";
import { formatInviteCode } from "@/lib/trainer-invites/code";

const IDLE: CreateInviteState = { status: "idle" };
const DEFAULT_DAYS = 14;

async function copy(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

/** The invite just created: link, code and QR, shown once (only the hash is stored). */
function CreatedInvite({ invite, onDone }: { invite: Extract<CreateInviteState, { status: "created" }>; onDone: () => void }) {
  const { t } = useI18n();
  const copyT = t.admin.invites.created;

  return (
    <section aria-labelledby="created-invite" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="created-invite" className="text-headline">
          {copyT.title}
        </h3>
        <p className="text-subhead text-ink-2">{copyT.text}</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          role="img"
          aria-label={copyT.qr}
          className="size-40 shrink-0 overflow-hidden rounded-sm bg-white [&>svg]:size-full"
          // Generated on the server from the invite link by the qrcode package, not from user input.
          dangerouslySetInnerHTML={{ __html: invite.qrSvg }}
        />
        <dl className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-footnote text-ink-2">{copyT.link}</dt>
            <dd className="text-subhead break-all select-all">{invite.link}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-footnote text-ink-2">{copyT.code}</dt>
            <dd className="text-headline tabular-nums select-all">{formatInviteCode(invite.code)}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Copy} onClick={() => void copy(invite.link, copyT.copied, copyT.copyFailed)}>
          {copyT.copyLink}
        </Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy(formatInviteCode(invite.code), copyT.copied, copyT.copyFailed)}>
          {copyT.copyCode}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {copyT.done}
        </Button>
      </div>
    </section>
  );
}

function Form({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const copyT = t.admin.invites.create;
  const [state, action, pending] = useActionState(createTrainerInvite, IDLE);

  if (state.status === "created") return <CreatedInvite invite={state} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField name="note" label={copyT.noteLabel} hint={copyT.noteHint} maxLength={200} autoComplete="off" />
      <TextField
        name="days"
        label={copyT.daysLabel}
        suffix={copyT.daysSuffix}
        error={state.status === "invalid-days" ? copyT.daysError : undefined}
        defaultValue={DEFAULT_DAYS}
        type="number"
        inputMode="numeric"
        min={1}
        max={90}
        required
        className="max-w-60"
      />
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {copyT.failed}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        {copyT.submit}
      </Button>
    </form>
  );
}

/** "Новое приглашение" in /admin/invites. "Готово" starts a fresh form, so the code disappears from the screen. */
export function CreateInviteForm() {
  const [round, setRound] = useState(0);
  return <Form key={round} onDone={() => setRound((value) => value + 1)} />;
}
