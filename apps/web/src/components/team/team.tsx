"use client";

import { Check, Repeat, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import {
  answerInvite,
  createAssistant,
  createSubstitute,
  createSubstitutes,
  inviteDelegate,
  markDelegatedAttendance,
  revokeDelegation,
  searchDelegates,
  setAssistantProgress,
  type DelegateCandidate,
  type DelegationInvite,
} from "@/lib/delegations/actions";
import { ASSISTANT_SCOPES, SUBSTITUTE_MAX, type AssistantScope } from "@/lib/delegations/rules";

/** Trainers found by name or @username, each with «Пригласить» (rule 1). */
function DelegateSearch({ delegationId, onInvited }: { delegationId: string; onInvited: () => void }) {
  const { t } = useI18n();
  const copy = t.team.link;
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<DelegateCandidate[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [inviting, startInvite] = useTransition();
  const latest = useRef("");

  function search(value: string) {
    setQuery(value);
    latest.current = value;
    if (value.replace(/^@/, "").trim().length < 2) return setFound(null);
    startSearch(async () => {
      const result = await searchDelegates(value);
      // Typing on starts newer searches; only the last one's answer is shown.
      if (latest.current === value) setFound(result.ok ? result.value : []);
    });
  }

  function invite(candidate: DelegateCandidate) {
    startInvite(async () => {
      const result = await inviteDelegate(delegationId, candidate.trainerId);
      if (!result.ok) {
        toast.error(result.reason === "expired" ? copy.inviteExpired : t.team.failed);
        return;
      }
      toast.success(interpolate(copy.invited, { name: candidate.name ?? copy.unnamed }));
      onInvited();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField type="search" label={copy.searchLabel} hint={copy.searchHint} value={query} onChange={(event) => search(event.target.value)} />
      {found === null ? null : found.length === 0 && !searching ? (
        <p className="px-1 text-callout text-ink-2">{copy.noResults}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {found.map((candidate) => (
            <li key={candidate.trainerId} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-ink">{candidate.name ?? copy.unnamed}</span>
                {candidate.username ? <span className="truncate text-footnote text-ink-2">@{candidate.username}</span> : null}
              </div>
              <Button size="sm" variant="secondary" disabled={inviting} onClick={() => invite(candidate)}>
                {copy.invite}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The one-time invite in a sheet: copy or share the link, or send it to a trainer found by search (rule 1). */
function InviteSheet({ invite, onClose }: { invite: DelegationInvite | null; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.team.link;
  return (
    <Sheet open={invite !== null} onOpenChange={(open) => !open && onClose()} title={copy.title} description={copy.text}>
      {invite ? (
        <div className="flex flex-col gap-6">
          <ReferralShare link={invite.link} shareText={copy.shareText} />
          <DelegateSearch delegationId={invite.id} onInvited={onClose} />
        </div>
      ) : null}
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
  const [invite, setInvite] = useState<DelegationInvite | null>(null);
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
      setInvite(result.value);
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
      <InviteSheet invite={invite} onClose={() => setInvite(null)} />
    </>
  );
}

/** «Передать на подмену» on the owner's session page. */
export function SubstituteButton({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const copy = t.team;
  const router = useRouter();
  const [invite, setInvite] = useState<DelegationInvite | null>(null);
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
            if (result.ok) setInvite(result.value);
            else toast.error(result.reason === "taken" ? copy.substitute.taken : copy.failed);
          })
        }
      >
        {copy.substitute.button}
      </Button>
      <InviteSheet
        invite={invite}
        onClose={() => {
          setInvite(null);
          router.refresh();
        }}
      />
    </>
  );
}

/** «Подмена на несколько занятий» on «Команда»: pick sessions ahead, then one invite for all of them. */
export function SubstituteSessionsButton({ sessions }: { sessions: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const copy = t.team.substituteMany;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<"none" | "many" | null>(null);
  const [invite, setInvite] = useState<DelegationInvite | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (picked.length === 0) return setError("none");
    if (picked.length > SUBSTITUTE_MAX) return setError("many");
    setError(null);
    startTransition(async () => {
      const result = await createSubstitutes(picked);
      if (!result.ok) {
        toast.error(result.reason === "taken" ? copy.taken : t.team.failed);
        return;
      }
      setOpen(false);
      setPicked([]);
      setInvite(result.value);
    });
  }

  return (
    <>
      <Button icon={Repeat} variant="secondary" onClick={() => setOpen(true)}>
        {copy.button}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.title} description={copy.text}>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.sessions}</legend>
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => (
                <ChipCheckbox
                  key={session.id}
                  checked={picked.includes(session.id)}
                  onChange={() => setPicked((list) => (list.includes(session.id) ? list.filter((id) => id !== session.id) : [...list, session.id]))}
                >
                  {session.label}
                </ChipCheckbox>
              ))}
            </div>
            {error ? (
              <p role="alert" className="px-1 text-footnote text-danger">
                {error === "none" ? copy.errorNone : interpolate(copy.errorMany, { max: SUBSTITUTE_MAX })}
              </p>
            ) : (
              <p aria-live="polite" className="px-1 text-footnote text-ink-2">
                {interpolate(copy.picked, { count: picked.length })}
              </p>
            )}
          </fieldset>
          <Button type="submit" size="lg" block loading={pending}>
            {t.team.form.create}
          </Button>
        </form>
      </Sheet>
      <InviteSheet invite={invite} onClose={() => setInvite(null)} />
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
