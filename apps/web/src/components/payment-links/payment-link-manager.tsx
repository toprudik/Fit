"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { addPaymentLink, archivePaymentLink, type PaymentLinkFormState } from "@/lib/payment-links/actions";
import { PAYMENT_LINK_KINDS, type PaymentLinkKind } from "@/lib/trainer-wizard/options";

export type PaymentLinkItem = { id: string; title: string; url: string; kind: PaymentLinkKind };

const IDLE: PaymentLinkFormState = { status: "idle" };

const isKind = (value: string): value is PaymentLinkKind => (PAYMENT_LINK_KINDS as readonly string[]).includes(value);

function AddForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useI18n();
  const copy = t.money.paymentLinks;
  const fields = t.trainerWizard.steps.payment;
  const [state, action, pending] = useActionState(addPaymentLink, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;
  const invalid = (field: string) => state.status === "invalid" && state.fields.includes(field);
  const [kind, setKind] = useState<PaymentLinkKind>(values && isKind(values.kind) ? values.kind : "sbp");

  useEffect(() => {
    if (state.status !== "added") return;
    toast.success(copy.added);
    onAdded();
  }, [state, copy.added, onAdded]);

  return (
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4" noValidate>
      <TextField
        name="title"
        label={fields.linkTitle}
        placeholder={fields.linkTitlePlaceholder}
        defaultValue={values?.title ?? ""}
        error={invalid("title") ? fields.linkTitleError : undefined}
        maxLength={64}
        autoComplete="off"
      />
      <TextField
        name="url"
        label={fields.url}
        placeholder="https://"
        defaultValue={values?.url ?? ""}
        error={invalid("url") ? fields.urlError : undefined}
        type="url"
        inputMode="url"
        maxLength={500}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {fields.kind}
        </span>
        <input type="hidden" name="kind" value={kind} />
        <SegmentedControl
          label={fields.kind}
          options={PAYMENT_LINK_KINDS.map((option) => ({ value: option, label: fields.kinds[option] }))}
          value={kind}
          onValueChange={setKind}
        />
      </div>
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.add}
      </Button>
    </form>
  );
}

/**
 * "Ссылки на оплату" (PRD wave-1 §2.8 rule 15): where the trainer's clients pay. Only https:// links are
 * kept (MONEY-11); removing archives one, so clients stop seeing it.
 */
export function PaymentLinkManager({ links }: { links: PaymentLinkItem[] }) {
  const { t } = useI18n();
  const copy = t.money.paymentLinks;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PaymentLinkItem | null>(null);
  const [pending, startTransition] = useTransition();
  const added = useCallback(() => setAdding(false), []);

  function remove(link: PaymentLinkItem) {
    startTransition(async () => {
      const { failed } = await archivePaymentLink(link.id);
      if (failed) {
        toast.error(copy.failed);
        return;
      }
      toast.success(copy.removed);
      setRemoving(null);
    });
  }

  return (
    <section aria-labelledby="payment-links" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <h2 id="payment-links" className="text-headline">
          {copy.title}
        </h2>
        <p className="text-subhead text-ink-2">{copy.text}</p>
      </div>
      {links.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <Link2 aria-hidden className="size-5 shrink-0 text-ink-2" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body break-words">{link.title}</span>
                <span className="text-footnote break-all text-ink-2">{link.url}</span>
              </div>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving(link)}>
                {copy.remove}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-subhead text-ink-2">{copy.empty}</p>
      )}
      <Button variant="secondary" size="lg" block icon={Plus} onClick={() => setAdding(true)}>
        {copy.add}
      </Button>

      <Sheet open={adding} onOpenChange={setAdding} title={copy.add}>
        {adding ? <AddForm onAdded={added} /> : null}
      </Sheet>
      <Sheet
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={copy.removeTitle}
        description={copy.removeText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={() => removing && remove(removing)}>
              {copy.remove}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setRemoving(null)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </section>
  );
}
