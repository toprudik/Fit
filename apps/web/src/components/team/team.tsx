"use client";

import { Check, Repeat, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReferralShare } from "@/components/referrals/referral-share";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { answerInvite, createAssistant, createSubstitute, markDelegatedAttendance, revokeDelegation, setAssistantProgress } from "@/lib/delegations/actions";
import { ASSISTANT_SCOPES, type AssistantScope } from "@/lib/delegations/rules";

/** The one-time invite link in a sheet: copy or share it (rule 1). */
function InviteSheet({ link, onClose }: { link: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.team.link;
  return (
    <Sheet open={link !== null} onOpenChange={(open) => !open && onClose()} title={copy.title} description={copy.text}>
      {link ? <ReferralShare link={link} shareText={copy.shareText} /> : null}
    </Sheet>
  );
}

/** «Добавить помощника»: scopes, clients (all or chosen) and an optional end date, then the invite link. */
export function AddAssistantButton({ clients }: { clients: { coachingId: string; name: string }[] }) {
  const { t } = useI18n();
  const copy = t.team;
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<AssistantScope[]>(["schedule", "attendance", "workouts"]);
  const [who, setWho] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<"scopes" | "clients" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  function submit() {
    if (scopes.length === 0) return setError("scopes");
    if (who === "pick" && picked.length === 0) return setError("clients");
    setError(null);
    startTransition(async () => {
      const result = await createAssistant({
        scopes,
        allClients: who === "all",
        coachingIds: picked,
        endsOn: endsOn || null,
      });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setOpen(false);
      setLink(result.value);
    });
  }

  return (
    <>
      <Button icon={UserPlus} onClick={() => setOpen(true)}>
        {copy.addAssistant}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.form.title} description={copy.form.moneyNote}>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.form.scopes}</legend>
            <div className="flex flex-wrap gap-2">
              {ASSISTANT_SCOPES.map((scope) => (
                <ChipCheckbox key={scope} checked={scopes.includes(scope)} onChange={() => setScopes((list) => toggle(list, scope))}>
                  {copy.scopes[scope]}
                </ChipCheckbox>
              ))}
            </div>
            {error === "scopes" ? (
              <p role="alert" className="px-1 text-footnote text-danger">
                {copy.form.errorScopes}
              </p>
            ) : null}
          </fieldset>
          <div className="flex flex-col gap-2">
            <span aria-hidden className="px-1 text-footnote text-ink-2">
              {copy.form.clients}
            </span>
            <SegmentedControl
              label={copy.form.clients}
              value={who}
              onValueChange={setWho}
              options={[
                { value: "all", label: copy.form.all },
                { value: "pick", label: copy.form.pick },
              ]}
            />
            {who === "pick" ? (
              clients.length === 0 ? (
                <p className="px-1 text-callout text-ink-2">{copy.form.noClients}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {clients.map((client) => (
                    <ChipCheckbox
                      key={client.coachingId}
                      checked={picked.includes(client.coachingId)}
                      onChange={() => setPicked((list) => toggle(list, client.coachingId))}
                    >
                      {client.name}
                    </ChipCheckbox>
                  ))}
                </div>
              )
            ) : null}
            {error === "clients" ? (
              <p role="alert" className="px-1 text-footnote text-danger">
                {copy.form.errorClients}
              </p>
            ) : null}
          </div>
          <TextField type="date" label={copy.form.endsOn} hint={copy.form.endsOnHint} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.form.create}
          </Button>
        </form>
      </Sheet>
      <InviteSheet link={link} onClose={() => setLink(null)} />
    </>
  );
}

/** «Передать на подмену» on the owner's session page. */
export function SubstituteButton({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const copy = t.team;
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        icon={Repeat}
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createSubstitute(sessionId);
            if (result.ok) setLink(result.value);
            else toast.error(result.reason === "taken" ? copy.substitute.taken : copy.failed);
          })
        }
      >
        {copy.substitute.button}
      </Button>
      <InviteSheet link={link} onClose={() => setLink(null)} />
    </>
  );
}

/** «Отозвать» on a delegation row: access ends at once (rule 7). */
export function RevokeButton({ delegationId, name }: { delegationId: string; name: string }) {
  const { t } = useI18n();
  const copy = t.team;
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      icon={Trash2}
      label={interpolate(copy.revokeLabel, { name })}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeDelegation(delegationId);
          if (result.ok) toast.success(copy.revoked);
          else toast.error(copy.failed);
        })
      }
    />
  );
}

/** Accept or decline on /trainer/team/accept. */
export function InviteAnswer({ token }: { token: string }) {
  const { t } = useI18n();
  const copy = t.team.accept;
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(accept: boolean) {
    setBusy(accept ? "accept" : "decline");
    startTransition(async () => {
      const result = await answerInvite(token, accept);
      setBusy(null);
      if (result.ok) {
        toast.success(accept ? copy.accepted : copy.declined);
        router.replace("/trainer/team");
        return;
      }
      toast.error(
        result.reason === "not_verified"
          ? copy.notVerified
          : result.reason === "own"
            ? copy.own
            : result.reason === "expired"
              ? copy.expired
              : result.reason === "not_found"
                ? copy.notFound
                : t.team.failed,
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" block icon={Check} loading={pending && busy === "accept"} disabled={pending} onClick={() => answer(true)}>
        {copy.accept}
      </Button>
      <Button size="lg" block variant="secondary" icon={X} loading={pending && busy === "decline"} disabled={pending} onClick={() => answer(false)}>
        {copy.decline}
      </Button>
    </div>
  );
}

/** A substitute's marks for one participant: present or no-show, by the owner's charging rules (1.2). */
export function AttendanceMarks({ bookingId, name, status }: { bookingId: string; name: string; status: string }) {
  const { t } = useI18n();
  const copy = t.team.session;
  const [pending, startTransition] = useTransition();
  const mark = (next: "attended" | "no_show") =>
    startTransition(async () => {
      const result = await markDelegatedAttendance(bookingId, next);
      if (result.ok) toast.success(copy.marked);
      else toast.error(t.team.failed);
    });
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={status === "attended" ? "primary" : "secondary"}
        disabled={pending}
        aria-label={interpolate(copy.presentLabel, { name })}
        aria-pressed={status === "attended"}
        onClick={() => mark("attended")}
      >
        {copy.present}
      </Button>
      <Button
        size="sm"
        variant={status === "no_show" ? "primary" : "secondary"}
        disabled={pending}
        aria-label={interpolate(copy.noShowLabel, { name })}
        aria-pressed={status === "no_show"}
        onClick={() => mark("no_show")}
      >
        {copy.noShow}
      </Button>
    </div>
  );
}

/** The client's switch: assistants of this trainer see progress and nutrition (rule 6, 1.7). */
export function AssistantProgressSwitch({ coachingId, blocked }: { coachingId: string; blocked: boolean }) {
  const { t } = useI18n();
  const copy = t.team.client;
  const [on, setOn] = useState(!blocked);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending}
      label={copy.progress}
      onCheckedChange={(next) => {
        setOn(next);
        startTransition(async () => {
          const result = await setAssistantProgress(coachingId, next);
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
