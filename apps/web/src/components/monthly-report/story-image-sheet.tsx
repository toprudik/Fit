"use client";

import { downloadFile, shareStory } from "@tma.js/sdk-react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { safely, safelyAsync, useInTelegram } from "@/lib/telegram/mini-app";

const FILE_NAME = "dafit-story.png";

/** The picture of a story card from the app's route, in the app's theme and language. */
export function storyImageUrl(id: string, theme: string, locale: string): string {
  return `${window.location.origin}/api/story/${id}?theme=${theme}&lang=${locale}`;
}

/**
 * A made story card (PRD wave-3 §4-8, marketing backlog 4): the 1080×1920 picture with "Выложить в сторис" in
 * Telegram, or the system share sheet elsewhere, and saving the picture. `text` goes with the story or the share.
 */
export function StoryImageSheet({ image, text, onClose }: { image: string | null; text: string; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.monthlyReport.stories;
  const inTelegram = useInTelegram();

  async function share(url: string) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], FILE_NAME, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch {
      // A cancelled share sheet throws too; nothing to report.
      return;
    }
    await navigator.share({ url, text }).catch(() => undefined);
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
              <Button block icon={Share2} onClick={() => safely(() => shareStory(image, { text }))}>
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
