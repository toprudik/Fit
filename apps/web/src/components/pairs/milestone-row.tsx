"use client";

import { useEffect, useState } from "react";
import { DaRing } from "@/components/brand/da-ring";
import { MomentShare } from "@/components/moments/moment-share";
import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list";
import { NEW_MILESTONE_DAYS } from "@/lib/pairs/milestones";

const seenKey = (milestoneId: string, side: string) => `dafit:milestone-seen:${side}:${milestoneId}`;

type MilestoneRowProps = {
  milestoneId: string;
  achievedAt: string;
  /** Only the newest milestone may be new. */
  newest: boolean;
  side: string;
  title: string;
  /** Under the title: when it was reached, or which milestone it is. */
  subtitle: string;
  badge: string;
  /** Where the row leads, e.g. the pair from "Сегодня". */
  href?: string;
};

/**
 * A reached milestone with its closed Da-ring. The newest one, reached within NEW_MILESTONE_DAYS and not yet seen by
 * this viewer here, plays the Da-moment once and says "Новая веха"; later visits show it closed. Browser storage
 * only remembers what this browser has shown. The client can share any reached milestone as a story card
 * (marketing backlog 4), right at the Da-moment or later.
 */
export function MilestoneRow({ milestoneId, achievedAt, newest, side, title, subtitle, badge, href }: MilestoneRowProps) {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    if (!newest || Date.now() - new Date(achievedAt).getTime() > NEW_MILESTONE_DAYS * 86_400_000) return;
    try {
      if (window.localStorage.getItem(seenKey(milestoneId, side))) return;
      window.localStorage.setItem(seenKey(milestoneId, side), "1");
    } catch {
      return;
    }
    // After hydration: the server renders the closed ring, and the Da-moment plays only in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNew(true);
  }, [newest, achievedAt, milestoneId, side]);
  return (
    <ListRow
      leading={<DaRing key={isNew ? "new" : "seen"} state="done" size={28} animate={isNew} />}
      title={title}
      subtitle={subtitle}
      trailing={
        <>
          {isNew ? <Badge tone="accent">{badge}</Badge> : null}
          {/* Only on rows that lead nowhere: a button inside a row link would be nested interactive content. */}
          {side === "client" && href === undefined ? <MomentShare kind="milestone" momentRef={milestoneId} label={title} /> : null}
        </>
      }
      href={href}
    />
  );
}
