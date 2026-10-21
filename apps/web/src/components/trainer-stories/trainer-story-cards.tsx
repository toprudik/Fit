"use client";

import { CalendarCheck, QrCode } from "lucide-react";
import { useState, useTransition } from "react";
import { StoryImageSheet } from "@/components/monthly-report/story-image-sheet";
import { PublicConsentSheet } from "@/components/public-data/public-consent-sheet";
import { ListGroup, ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { TrainerStoryKind } from "@/lib/monthly-report/report";
import { useTheme } from "@/lib/theme/store";
import { createTrainerStoryCard } from "@/lib/trainer-stories/actions";

/**
 * «Карточки для сторис» of a trainer (marketing backlog 5): «Мой месяц в DaFit» of a finished month (`month.param`,
 * "2026-09", and its name in the trainer's language) on the analytics, the showcase with a QR on the showcase editor.
 * The month recap asks for the consent to publish story cards first, as the clients' cards do (152-FZ art. 10.1); the
 * showcase card rides on the showcase consent, so without it the showcase is closed and there is nothing to show.
 */
export function TrainerStoryCards({ month, showcase = false }: { month?: { param: string; name: string }; showcase?: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.trainerStories;
  const { theme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [image, setImage] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);

  function make(kind: TrainerStoryKind) {
    startTransition(async () => {
      const result = await createTrainerStoryCard({ kind, month: kind === "trainer_month" ? month?.param : undefined });
      if (result.status === "created") {
        setImage(`${window.location.origin}/api/story/${result.id}?theme=${theme}&lang=${locale}`);
        return;
      }
      if (result.status === "consent" && kind === "trainer_month") setAskConsent(true);
      else if (result.status === "consent" || result.status === "empty")
        toast.error(kind === "trainer_month" ? copy.emptyMonth : copy.closedShowcase);
      else toast.error(copy.failed);
    });
  }

  return (
    <>
      <ListGroup header={copy.header} footer={month ? copy.footer : undefined}>
        {month ? (
          <ListRow
            icon={CalendarCheck}
            title={interpolate(copy.month, { month: month.name })}
            value={copy.make}
            onClick={pending ? undefined : () => make("trainer_month")}
          />
        ) : null}
        {showcase ? (
          <ListRow icon={QrCode} title={copy.showcase} value={copy.make} onClick={pending ? undefined : () => make("trainer_showcase")} />
        ) : null}
      </ListGroup>
      <PublicConsentSheet scope="story" open={askConsent} onOpenChange={setAskConsent} onDone={() => make("trainer_month")} />
      <StoryImageSheet image={image} onClose={() => setImage(null)} />
    </>
  );
}
