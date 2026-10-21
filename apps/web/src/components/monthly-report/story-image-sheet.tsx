"use client";

import { downloadFile, shareStory } from "@tma.js/sdk-react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { safely, safelyAsync, useInTelegram } from "@/lib/telegram/mini-app";

const FILE_NAME = "dafit-story.png";

/**
 * A made story card (PRD wave-3 §4-8): the 1080×1920 picture with "Выложить в сторис" in Telegram, or sharing and
 * saving elsewhere. The client's monthly cards and the trainer's cards (marketing backlog 5) both open it.
 */
export function StoryImageSheet({ image, onClose }: { image: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.monthlyReport.stories;
  const inTelegram = useInTelegram();

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
    <Sheet
      open={image !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
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
  );
}
