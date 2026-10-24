"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useI18n } from "@/i18n/client";

type Segment = "upcoming" | "past" | "requests";

/** "Предстоящие / История / Запросы" of /client/sessions; the lists are rendered on the server. */
export function BookingSegments({ panels, initial }: { panels: Record<Segment, React.ReactNode>; initial: Segment }) {
  const { t } = useI18n();
  const copy = t.schedule.clientSessions;
  const [segment, setSegment] = useState<Segment>(initial);
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label={copy.segments}
        value={segment}
        onValueChange={setSegment}
        options={[
          { value: "upcoming", label: copy.upcoming },
          { value: "past", label: copy.past },
          { value: "requests", label: copy.requests },
        ]}
      />
      {panels[segment]}
    </div>
  );
}
