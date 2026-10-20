"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { reportContent, reportShowcase, type ReportResult } from "@/lib/reports/actions";
import {
  REPORT_CONTACT_MAX,
  REPORT_REASONS,
  REPORT_TEXT_MAX,
  reportText,
  type ReportableTarget,
  type ReportReason,
} from "@/lib/reports/reports";

type Target = { kind: "content"; targetType: ReportableTarget; targetId: string } | { kind: "showcase"; slug: string };

/**
 * "Пожаловаться" (DSA art. 16): a reason, optional details and, on a public showcase, an optional contact. The
 * receipt comes to the bot; on a showcase, where the person may not be signed in, the toast is the receipt.
 */
export function ReportButton({ target, size = "sm" }: { target: Target; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const copy = t.reports;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [errors, setErrors] = useState<{ reason?: string; body?: string; contact?: string }>({});
  const [pending, startTransition] = useTransition();
  const showcase = target.kind === "showcase";
  const idBase = showcase ? `report-${target.slug}` : `report-${target.targetId}`;

  function done({ status }: ReportResult) {
    if (status === "sent") {
      setOpen(false);
      toast.success(showcase ? copy.sentPublic : copy.sent);
    } else if (status === "limit") toast.error(copy.limit);
    else if (status === "gone") toast.error(copy.gone);
    else toast.error(copy.failed);
  }

  function submit(formData: FormData) {
    const body = reportText(String(formData.get("details") ?? ""));
    const contact = showcase ? reportText(String(formData.get("contact") ?? ""), REPORT_CONTACT_MAX) : null;
    const next = {
      reason: reason ? undefined : copy.errors.reason,
      body: body === "long" ? copy.errors.long : undefined,
      contact: contact === "long" ? copy.errors.contactLong : undefined,
    };
    setErrors(next);
    if (!reason || body === "long" || contact === "long") return;
    startTransition(async () => {
      done(
        target.kind === "showcase"
          ? await reportShowcase({ slug: target.slug, reason, body: body ?? undefined, contact: contact ?? undefined })
          : await reportContent({ targetType: target.targetType, targetId: target.targetId, reason, body: body ?? undefined }),
      );
    });
  }

  return (
    <>
      <Button
        icon={Flag}
        size={size}
        variant="ghost"
        onClick={() => {
          setReason(null);
          setErrors({});
          setOpen(true);
        }}
      >
        {copy.report}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.title} description={copy.text}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <fieldset aria-describedby={errors.reason ? `${idBase}-reason-error` : undefined}>
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.reason}</legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((value) => (
                <ChipRadio key={value} name="reason" value={value} checked={reason === value} onChange={() => setReason(value)}>
                  {copy.reasons[value]}
                </ChipRadio>
              ))}
            </div>
            {errors.reason ? (
              <p id={`${idBase}-reason-error`} className="mt-2 px-1 text-footnote text-danger">
                {errors.reason}
              </p>
            ) : null}
          </fieldset>
          <TextArea name="details" label={copy.details} hint={copy.detailsHint} error={errors.body} maxLength={REPORT_TEXT_MAX + 100} />
          {showcase ? (
            <TextField
              name="contact"
              label={copy.contact}
              hint={copy.contactHint}
              error={errors.contact}
              maxLength={REPORT_CONTACT_MAX + 20}
              autoComplete="email"
            />
          ) : null}
          <Button type="submit" size="lg" block loading={pending}>
            {copy.send}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
