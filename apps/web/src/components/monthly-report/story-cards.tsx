"use client";

import { downloadFile, shareStory } from "@tma.js/sdk-react";
import { Award, CalendarCheck, Download, Flame, Scale, Share2, Trophy, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { PublicConsentSheet } from "@/components/public-data/public-consent-sheet";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { createStoryCard } from "@/lib/monthly-report/actions";
import type { StoryKind, StoryOption } from "@/lib/monthly-report/report";
import { useTheme } from "@/lib/theme/store";
import { safely, safelyAsync, useInTelegram } from "@/lib/telegram/mini-app";

const ICONS = {
  sessions: CalendarCheck,
  trainer: Users,
  records: Trophy,
  streak_workouts: Flame,
  streak_diary: Flame,
  streak_steps: Flame,
  badges: Award,
  weight: Scale,
} as const;
const FILE_NAME = "dafit-story.png";

/**
 * "Карточки для сторис" of a monthly report (PRD wave-3 §4-4…4-8): the client picks a card, the server freezes
 * it, and the 1080×1920 picture opens with "Выложить в сторис" in Telegram, or sharing and saving elsewhere.
 * The weight card asks first (§4-5), and the first card asks for the consent to publish story cards (152-FZ
 * art. 10.1), then is made. The picture follows the app's theme and language.
 */
export function StoryCards({ month, options }: { month: string; options: StoryOption[] }) {
  const { t, locale } = useI18n();
  const copy = t.monthlyReport.stories;
  const { theme } = useTheme();
  const inTelegram = useInTelegram();
  const [pending, startTransition] = useTransition();
  const [confirmWeight, setConfirmWeight] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<{ option: StoryOption; confirm: boolean } | null>(null);

  if (!options.length) return null;

  function make(option: StoryOption, confirm = false) {
    startTransition(async () => {
      const result = await createStoryCard({ month, kind: option.kind, coachingId: option.coachingId, confirm });
      if (result.status === "consent") {
        setConfirmWeight(false);
        setConsentFor({ option, confirm });
        return;
      }
      if (result.status !== "created") {
        toast.error(copy.failed);
        return;
      }
      setConfirmWeight(false);
      setImage(`${window.location.origin}/api/story/${result.id}?theme=${theme}&lang=${locale}`);
    });
  }

  function title(kind: StoryKind, name?: string | null) {
    return kind === "trainer" && name ? `${copy.kinds.trainer}: ${name}` : copy.kinds[kind];
  }

  async function share(url: string) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], FILE_NAME, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: copy.storyText });
        return;
      }
    } catch {
      // A cancelled share sheet throws too; nothing to report.
      return;
    }
    await navigator.share({ url, text: copy.storyText }).catch(() => undefined);
  }

  const storyAvailable = inTelegram && safely(() => shareStory.isAvailable()) === true;
  const downloadAvailable = inTelegram && safely(() => downloadFile.isAvailable()) === true;

  return (
    <>
      <ListGroup header={copy.header} footer={copy.footer}>
        {options.map((option) => (
          <ListRow
            key={`${option.kind}-${option.coachingId ?? ""}`}
            icon={ICONS[option.kind]}
            title={title(option.kind, option.name)}
            value={copy.make}
            onClick={pending ? undefined : () => (option.kind === "weight" ? setConfirmWeight(true) : make(option))}
          />
        ))}
      </ListGroup>

      <Sheet
        open={confirmWeight}
        onOpenChange={setConfirmWeight}
        title={copy.weightTitle}
        description={copy.weightText}
        actions={
          <>
            <Button block loading={pending} onClick={() => make({ kind: "weight" }, true)}>
              {copy.weightConfirm}
            </Button>
            <Button block variant="secondary" onClick={() => setConfirmWeight(false)}>
              {copy.weightCancel}
            </Button>
          </>
        }
      />

      <PublicConsentSheet
        scope="story"
        open={consentFor !== null}
        onOpenChange={(open) => (open ? undefined : setConsentFor(null))}
        onDone={() => {
          if (consentFor) make(consentFor.option, consentFor.confirm);
        }}
      />

      <Sheet
        open={image !== null}
        onOpenChange={(open) => (open ? undefined : setImage(null))}
        title={copy.header}
        actions={
          image ? (
            <>
              {storyAvailable ? (
                <Button block icon={Share2} onClick={() => safely(() => shareStory(image, { text: copy.storyText }))}>
                  {copy.shareStory}
                </Button>
              ) : typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <Button block icon={Share2} onClick={() => void share(image)}>
                  {copy.share}
                </Button>
              ) : null}
              {downloadAvailable ? (
                <Button block variant="secondary" icon={Download} onClick={() => void safelyAsync(() => downloadFile(image, FILE_NAME))}>
                  {copy.save}
                </Button>
              ) : (
                <Button block variant="secondary" icon={Download} asChild>
                  <a href={image} download={FILE_NAME}>
                    {copy.save}
                  </a>
                </Button>
              )}
            </>
          ) : null
        }
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated PNG of our own route, not a static asset
          <img src={image} alt={copy.alt} width={1080} height={1920} className="mx-auto h-auto max-h-[50vh] w-auto rounded-lg" />
        ) : null}
      </Sheet>
    </>
  );
}
