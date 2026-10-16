"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { resolveClaim } from "@/lib/pairs/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

export type ClaimCardRow = {
  id: string;
  name: string;
  since: string;
  match: boolean;
  carries: { sessions: number; passes: number; payments: number; notes: number; measurements: number };
};

type ClaimAnswersProps = {
  claimId: string;
  cards: ClaimCardRow[];
  /** Shown under "Это новый клиент": the Free limit warning and the Pro request (Q65). */
  newClientNote?: React.ReactNode;
};

/**
 * The answers on "Это тот же клиент?": a card opens the preview of what moves and "Объединить" (cannot be
 * undone); "Это новый клиент" keeps the person as they came. Either way the screen moves on to the pair.
 */
export function ClaimAnswers({ claimId, cards, newClientNote }: ClaimAnswersProps) {
  const { t } = useI18n();
  const copy = t.pairs.claims;
  const router = useRouter();
  const [picked, setPicked] = useState<ClaimCardRow | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(cardId: string | null) {
    startTransition(async () => {
      const result = await resolveClaim({ claimId, cardId });
      if (!result.ok) {
        toast.error(t.pairs.failed);
        if (result.reason !== "failed") router.refresh();
        return;
      }
      hapticSuccess();
      setPicked(null);
      toast.success(result.outcome === "merged" ? copy.merged : result.outcome === "closed" ? copy.closed : copy.kept);
      router.replace(result.outcome === "closed" ? "/trainer/clients" : `/trainer/clients/${result.coachingId}`);
    });
  }

  const rows = picked
    ? ([
        ["sessions", copy.sessions],
        ["passes", copy.passes],
        ["payments", copy.payments],
        ["notes", copy.notes],
        ["measurements", copy.measurements],
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <ListGroup header={copy.cardsHeader} footer={cards.length ? undefined : copy.noCards}>
        {cards.map((card) => (
          <ListRow
            key={card.id}
            avatar={{ name: card.name }}
            title={card.name}
            subtitle={card.since}
            trailing={card.match ? <Badge tone="accent">{copy.match}</Badge> : null}
            onClick={() => !pending && setPicked(card)}
          />
        ))}
      </ListGroup>

      <div className="flex flex-col gap-3">
        <Button variant="secondary" size="lg" block loading={pending && !picked} disabled={pending} onClick={() => answer(null)}>
          {copy.newClient}
        </Button>
        {newClientNote}
      </div>

      <Sheet
        open={picked !== null}
        onOpenChange={(open) => !pending && !open && setPicked(null)}
        title={picked ? interpolate(copy.confirmTitle, { name: picked.name }) : ""}
        description={copy.confirmText}
      >
        <div className="flex flex-col gap-4">
          <ListGroup surface="raised">
            {rows.map(([key, label]) => (
              <ListRow key={key} title={label} value={String(picked?.carries[key] ?? 0)} />
            ))}
          </ListGroup>
          <div className="flex flex-col gap-2">
            <Button size="lg" block loading={pending} onClick={() => picked && answer(picked.id)}>
              {copy.merge}
            </Button>
            <Button variant="ghost" size="lg" block disabled={pending} onClick={() => setPicked(null)}>
              {copy.cancel}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
