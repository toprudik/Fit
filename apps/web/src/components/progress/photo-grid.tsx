"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { deleteProgressPhoto } from "@/lib/progress/photo-actions";
import { PHOTO_ANGLES, type PhotoAngle, type PhotoSet } from "@/lib/progress/photos";
import { formatLogDay } from "@/lib/workouts/present";

type Open = { date: string; angle: PhotoAngle; id: string; url: string };

/**
 * Photo sets by date × angle (screens.md "Фото прогресса"). The client opens a photo to retake or delete it
 * and fills a missing angle from its empty cell; the trainer only looks. Links expire after five minutes, so
 * a page left open shows broken images until it is reloaded, as intended (PROG-6).
 */
export function PhotoGrid({ sets, today, editable }: { sets: PhotoSet[]; today: string; editable: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.progress.photos;
  const thisYear = Number(today.slice(0, 4));
  const [open, setOpen] = useState<Open | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const day = (date: string) => formatLogDay(locale, date, thisYear);

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteProgressPhoto(id);
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setOpen(null);
      toast.success(copy.deleted);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {sets.map((set) => (
        <section key={set.date} className="flex flex-col gap-2" aria-label={day(set.date)}>
          <h3 className="px-4 text-footnote text-ink-2">{day(set.date)}</h3>
          <ul className="grid grid-cols-3 gap-2">
            {PHOTO_ANGLES.map((angle) => {
              const photo = set.photos[angle];
              const label = interpolate(copy.alt, { angle: copy.angles[angle], date: day(set.date) });
              return (
                <li key={angle} className="flex flex-col gap-1">
                  {photo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(false);
                        setOpen({ date: set.date, angle, id: photo.id, url: photo.url });
                      }}
                      className="aspect-[3/4] overflow-hidden rounded-md bg-surface-2"
                    >
                      {/* A signed Storage link that lives five minutes; next/image would cache it. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={label} loading="lazy" className="size-full object-cover" />
                    </button>
                  ) : editable ? (
                    <Link
                      href={`/client/progress/photos/new?angle=${angle}&date=${set.date}`}
                      aria-label={interpolate(copy.addAngle, { angle: copy.angles[angle], date: day(set.date) })}
                      className="grid aspect-[3/4] place-items-center rounded-md border border-dashed border-line-strong text-ink-2"
                    >
                      <Plus aria-hidden size={24} />
                    </Link>
                  ) : (
                    <div aria-hidden className="aspect-[3/4] rounded-md bg-surface-1" />
                  )}
                  <span aria-hidden className="text-center text-footnote text-ink-2">
                    {copy.angles[angle]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Sheet
        open={open !== null}
        onOpenChange={(next) => !pending && !next && setOpen(null)}
        title={open ? interpolate(copy.alt, { angle: copy.angles[open.angle], date: day(open.date) }) : ""}
      >
        {open ? (
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt="" className="max-h-[60vh] w-full rounded-md object-contain" />
            {editable ? (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/client/progress/photos/new?angle=${open.angle}&date=${open.date}`}
                  className={buttonVariants({ variant: "secondary", size: "lg", block: true })}
                >
                  {copy.retake}
                </Link>
                <Button
                  type="button"
                  variant={confirming ? "destructive" : "ghost"}
                  size="lg"
                  block
                  loading={pending}
                  onClick={() => (confirming ? remove(open.id) : setConfirming(true))}
                >
                  {confirming ? copy.deleteConfirm : copy.delete}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
