"use client";

import { ExternalLink, SquarePlus } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { fileFeedbackIssueNow, setFeedbackStatus } from "@/lib/feedback/admin-actions";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback/status";

/** The status of one message (ADM-9): the change is saved at once and logged. */
export function FeedbackStatusControl({ id, status }: { id: string; status: FeedbackStatus }) {
  const { t } = useI18n();
  const copy = t.adminFeedback;
  const [, startTransition] = useTransition();
  return (
    <SegmentedControl
      label={copy.status}
      options={FEEDBACK_STATUSES.map((value) => ({ value, label: copy.statuses[value] }))}
      value={status}
      onValueChange={(next) =>
        startTransition(async () => {
          if ((await setFeedbackStatus({ id, status: next })).status !== "done") toast.error(copy.statusFailed);
        })
      }
    />
  );
}

/** The issue link, or "Создать issue" when the automatic one is missing (no token then, or GitHub failed). */
export function FeedbackIssue({ id, url, enabled }: { id: string; url: string | null; enabled: boolean }) {
  const { t } = useI18n();
  const copy = t.adminFeedback;
  const [pending, startTransition] = useTransition();
  if (url) {
    return (
      <Button asChild variant="secondary" size="sm" icon={ExternalLink} className="self-start">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {copy.openIssue}
        </a>
      </Button>
    );
  }
  if (!enabled) return <p className="px-4 text-footnote text-ink-2">{copy.issueDisabled}</p>;
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={SquarePlus}
      loading={pending}
      className="self-start"
      onClick={() =>
        startTransition(async () => {
          const { status } = await fileFeedbackIssueNow({ id });
          if (status === "filed" || status === "exists") toast.success(copy.issueFiled);
          else if (status === "disabled") toast.error(copy.issueDisabled);
          else toast.error(copy.issueFailed);
        })
      }
    >
      {copy.fileIssue}
    </Button>
  );
}
