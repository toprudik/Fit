"use client";

import { useActionState } from "react";
import { DaRing } from "@/components/brand/da-ring";
import { ChipRadio } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { joinWaitlist, type WaitlistState } from "@/lib/waitlist/actions";
import { CLIENT_COUNTS } from "@/lib/waitlist/waitlist";

const INITIAL: WaitlistState = { status: "idle" };

type Props = {
  /** Signed in, the entry is the account's and a contact is optional. */
  signedIn: boolean;
  /** The first name from the profile, to start the name field with. */
  name: string | null;
  /** The channel label of the visit, if the link carried one. */
  source: string | null;
};

/**
 * The waitlist form of /for-trainers (marketing backlog item 10): name, contact, how many clients, consent.
 * After «Записаться» the form gives way to the Da-moment of being on the list.
 */
export function WaitlistForm({ signedIn, name, source }: Props) {
  const { t, locale } = useI18n();
  const copy = t.forTrainers.form;
  const [state, action, pending] = useActionState(joinWaitlist, INITIAL);

  if (state.status === "done") return <WaitlistJoined celebrate />;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      {source ? <input type="hidden" name="source" value={source} /> : null}
      {/* Left empty by people; bots that fill every field are told they joined and nothing is written. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          {copy.website}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <TextField label={copy.name} name="name" defaultValue={name ?? ""} autoComplete="given-name" required maxLength={80} />
      <TextField
        label={copy.contact}
        hint={signedIn ? copy.contactOptional : copy.contactHint}
        name="contact"
        autoComplete="off"
        required={!signedIn}
        minLength={3}
        maxLength={120}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.clients}</legend>
        <div className="flex flex-wrap gap-2">
          {CLIENT_COUNTS.map((value) => (
            <ChipRadio key={value} name="clients" value={value}>
              {copy.clientCounts[value]}
            </ChipRadio>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 px-1 text-subhead text-ink-2">
        <input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--accent)]" />
        <span>{copy.consent}</span>
      </label>
      {state.status === "error" ? (
        <p role="alert" className="px-1 text-subhead text-danger">
          {copy.errors[state.error]}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** On the list; `celebrate` plays the Da-moment, only right after «Записаться». */
export function WaitlistJoined({ celebrate = false }: { celebrate?: boolean }) {
  const { t } = useI18n();
  const copy = t.forTrainers.joined;
  return (
    <div role="status" className="flex flex-col items-start gap-3">
      <DaRing state="done" size={64} animate={celebrate} />
      <h3 className="text-title-2">{copy.title}</h3>
      <p className="text-callout text-ink-2">{copy.text}</p>
    </div>
  );
}
