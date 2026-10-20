"use client";

import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { revokePublicConsent } from "@/lib/public-data/actions";
import { newPlaces, type PublicConsent, type PublicPlace } from "@/lib/public-data/consent";
import { PublicConsentSheet } from "./public-consent-sheet";

/**
 * "Включить витрину" asks for the consent to publish first (152-FZ art. 10.1); "Выключить витрину" revokes it, and
 * "Изменить, что на витрине" gives a new one with other fields. Replaces the plain on/off form. A place added after
 * the consent is not published silently: the trainer is told it is hidden and can tick it.
 */
export function ShowcaseConsent({
  visible,
  consent,
  places = [],
}: {
  visible: boolean;
  consent: PublicConsent | null;
  places?: readonly PublicPlace[];
}) {
  const { t } = useI18n();
  const copy = t.showcase.editor;
  const [sheet, setSheet] = useState<"new" | "change" | null>(null);
  const [pending, startTransition] = useTransition();
  const hidden = visible ? newPlaces(places, consent) : [];

  function hide() {
    startTransition(async () => {
      const { status } = await revokePublicConsent("showcase");
      if (status !== "done") toast.error(copy.toggleFailed);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {hidden.length > 0 ? (
        <section aria-labelledby="showcase-new-places" className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
          <h2 id="showcase-new-places" className="text-headline">
            {t.publicData.newPlaces.title}
          </h2>
          <p className="text-subhead text-ink-2">
            {t.publicData.newPlaces.text} {hidden.map((place) => place.name).join(", ")}
          </p>
        </section>
      ) : null}
      {visible ? (
        <>
          <Button variant="secondary" size="lg" block icon={SlidersHorizontal} onClick={() => setSheet("change")}>
            {t.publicData.change}
          </Button>
          <Button variant="ghost" size="lg" block icon={EyeOff} loading={pending} onClick={hide}>
            {copy.hide}
          </Button>
          <p className="px-1 text-footnote text-ink-2">{t.publicData.hideHint}</p>
        </>
      ) : (
        <Button size="lg" block icon={Eye} onClick={() => setSheet("new")}>
          {copy.show}
        </Button>
      )}
      <PublicConsentSheet
        scope="showcase"
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        initial={sheet === "change" ? consent : null}
        places={places}
      />
    </div>
  );
}
