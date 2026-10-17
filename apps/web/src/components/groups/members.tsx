"use client";

import { TriangleAlert, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { addGroupMember, makePrimaryGroup, removeGroupMember } from "@/lib/groups/actions";
import type { Goal } from "@/lib/nutrition/target";

type Candidate = { coachingId: string; name: string; goal: Goal | null; hasTemplateGroup: boolean };

/**
 * "Добавить клиентов": the trainer's live pairs outside the group. A client whose goal differs from the group's
 * is marked before adding (§6.2); a client already in a group with a template is asked which group stays
 * primary for nutrition (§6.3).
 */
export function AddMembers({ groupId, groupGoal, candidates }: { groupId: string; groupGoal: Goal | null; candidates: Candidate[] }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.member;
  const goals = t.trainerGroups.goals;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(candidate: Candidate, makePrimary?: boolean) {
    setBusy(candidate.coachingId);
    startTransition(async () => {
      const result = await addGroupMember(groupId, candidate.coachingId, makePrimary);
      setBusy(null);
      if (!result.ok && result.reason === "primary") {
        setChoice(candidate);
        return;
      }
      setChoice(null);
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      if (result.value && candidate.goal) {
        toast.warning(interpolate(copy.goalWarningToast, { name: candidate.name, goal: goals[candidate.goal].toLowerCase() }));
      } else {
        toast.success(interpolate(copy.added, { name: candidate.name }));
      }
    });
  }

  return (
    <>
      <Button icon={UserPlus} variant="secondary" onClick={() => setOpen(true)}>
        {copy.add}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={copy.addTitle}>
        {candidates.length === 0 ? (
          <p className="px-1 text-callout text-ink-2">{copy.addEmpty}</p>
        ) : (
          <ListGroup>
            {candidates.map((candidate) => {
              const mismatch = groupGoal !== null && candidate.goal !== null && candidate.goal !== groupGoal;
              return (
                <ListRow
                  key={candidate.coachingId}
                  title={candidate.name}
                  subtitle={
                    mismatch && candidate.goal ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Badge tone="warning" icon={TriangleAlert}>
                          {copy.goalOther}
                        </Badge>
                        {interpolate(copy.goalWarning, { goal: goals[candidate.goal].toLowerCase() })}
                      </span>
                    ) : candidate.goal ? (
                      goals[candidate.goal]
                    ) : undefined
                  }
                  trailing={
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pending && busy === candidate.coachingId}
                      onClick={() => add(candidate)}
                      aria-label={interpolate(copy.addLabel, { name: candidate.name })}
                    >
                      {copy.addButton}
                    </Button>
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </Sheet>
      <Sheet
        open={choice !== null}
        onOpenChange={(next) => !pending && !next && setChoice(null)}
        title={copy.primaryTitle}
        description={choice ? interpolate(copy.primaryText, { name: choice.name }) : undefined}
        actions={
          <div className="flex flex-col gap-2">
            <Button size="lg" block loading={pending} onClick={() => choice && add(choice, true)}>
              {copy.primaryThis}
            </Button>
            <Button size="lg" block variant="secondary" disabled={pending} onClick={() => choice && add(choice, false)}>
              {copy.primaryKeep}
            </Button>
          </div>
        }
      />
    </>
  );
}

/** Row actions of a member: "Сделать основной" when another group gives the target, and "Убрать". */
export function MemberActions({ groupId, coachingId, name, canMakePrimary }: { groupId: string; coachingId: string; name: string; canMakePrimary: boolean }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.member;
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1">
      {canMakePrimary ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await makePrimaryGroup(groupId, coachingId);
              if (!result.ok) toast.error(copy.failed);
              else toast.success(interpolate(copy.madePrimary, { name }));
            })
          }
        >
          {copy.makePrimary}
        </Button>
      ) : null}
      <IconButton
        icon={X}
        label={interpolate(copy.removeLabel, { name })}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeGroupMember(groupId, coachingId);
            if (!result.ok) toast.error(copy.failed);
            else toast.success(interpolate(copy.removed, { name }));
          })
        }
      />
    </div>
  );
}
