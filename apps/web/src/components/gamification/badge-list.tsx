"use client";

import { useEffect, useRef } from "react";
import { DaRing } from "@/components/brand/da-ring";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { useI18n } from "@/i18n/client";
import { markBadgesSeen } from "@/lib/gamification/actions";
import type { BadgeCode } from "@/lib/gamification/gamification";

export type BadgeRow = { code: BadgeCode; earnedOn: string | null; isNew: boolean };

/**
 * The badge list (§2.2): earned badges with the closed Da-ring and the date, the rest still ahead. New badges
 * play the Da-moment once (none with reduced motion) and are marked seen; only the client marks them.
 */
export function BadgeList({ rows, header, markSeen }: { rows: BadgeRow[]; header: string; markSeen: boolean }) {
  const { t } = useI18n();
  const copy = t.gamification.badges;
  const marked = useRef(false);
  const anyNew = rows.some((row) => row.isNew);

  useEffect(() => {
    if (!markSeen || !anyNew || marked.current) return;
    marked.current = true;
    void markBadgesSeen();
  }, [markSeen, anyNew]);

  return (
    <ListGroup header={header}>
      {rows.map((row) => {
        const item = copy.items[row.code];
        return row.earnedOn ? (
          <ListRow
            key={row.code}
            leading={<DaRing state="done" size={28} animate={markSeen && row.isNew} />}
            title={item.title}
            subtitle={row.earnedOn}
            trailing={row.isNew ? <Badge tone="accent">{copy.new}</Badge> : undefined}
          />
        ) : (
          <ListRow
            key={row.code}
            leading={<DaRing state="progress" value={0} size={28} />}
            title={<span className="text-ink-2">{item.title}</span>}
            subtitle={item.text}
          />
        );
      })}
    </ListGroup>
  );
}
