"use client";

import { Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { StoryImageSheet, storyImageUrl } from "@/components/monthly-report/story-image-sheet";
import { PublicConsentSheet } from "@/components/public-data/public-consent-sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { createMomentCard } from "@/lib/moments/actions";
import type { MomentKind } from "@/lib/monthly-report/report";
import { useTheme } from "@/lib/theme/store";

/**
 * "Поделиться" on the client's milestone or badge (marketing backlog 4, virality §2.1): the server freezes a story
 * card of the moment, and the picture opens with "Выложить в сторис" in Telegram, or sharing and saving elsewhere.
 * The first card asks for the consent to publish story cards (152-FZ art. 10.1), then is made. `label` names the
 * moment for screen readers.
 */
export function MomentShare({ kind, momentRef, label }: { kind: MomentKind; momentRef: string; label: string }) {
  const { t, locale } = useI18n();
  const copy = t.monthlyReport.stories;
  const { theme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [image, setImage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  function make() {
    startTransition(async () => {
      const result = await createMomentCard({ kind, ref: momentRef });
      if (result.status === "consent") {
        setConsent(true);
        return;
      }
      if (result.status !== "created") {
        toast.error(copy.failed);
        return;
      }
      setImage(storyImageUrl(result.id, theme, locale));
    });
  }

  return (
    <>
      <Button size="sm" variant="ghost" icon={Share2} loading={pending} aria-label={`${copy.share}: ${label}`} onClick={make} />
      <PublicConsentSheet scope="story" open={consent} onOpenChange={setConsent} onDone={make} />
      <StoryImageSheet image={image} text={t.monthlyReport.card.momentText} onClose={() => setImage(null)} />
    </>
  );
}
