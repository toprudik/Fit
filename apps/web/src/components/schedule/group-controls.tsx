"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { addGroupParticipant, updateGroupSeats, type GroupError } from "@/lib/schedule/session-actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { SELECT_CLASS } from "./week-template-editor";

type Props = {
  sessionId: string;
  capacity: number;
  taken: number;
  openForBooking: boolean;
  /** Clients of live pairs who are not on the session yet. */
  candidates: { coachingId: string; name: string }[];
};

/**
 * The trainer's controls on a future group session (PRD 2.6.3): add a client, confirmed at once with К1, and
 * change the seats or whether clients book it themselves.
 */
export function GroupControls({ sessionId, capacity, taken, openForBooking, candidates }: Props) {
  const { t } = useI18n();
  const copy = t.schedule.groupSession;
  const [sheet, setSheet] = useState<"add" | "seats" | null>(null);
  const [coachingId, setCoachingId] = useState("");
  const [seats, setSeats] = useState(String(capacity));
  const [open, setOpen] = useState(openForBooking);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errorText = (key: GroupError) => copy.errors[key];
  const full = taken >= capacity;
  /** A full session takes one more client out of turn and grows by a seat, up to 100. */
  const canAdd = candidates.length > 0 && (!full || capacity < 100);
  const show = (next: "add" | "seats") => {
    setError(null);
    setCoachingId(candidates.length === 1 ? candidates[0].coachingId : "");
    setSeats(String(capacity));
    setOpen(openForBooking);
    setSheet(next);
  };

  const add = () => {
    if (!coachingId) return setError(t.schedule.sessionForm.chooseClient);
    startTransition(async () => {
      const result = await addGroupParticipant({ sessionId, coachingId, extra: full });
      if (result.status === "error") return setError(errorText(result.error));
      hapticSuccess();
      toast.success(copy.added);
      setSheet(null);
    });
  };

  const saveSeats = () => {
    const value = Number(seats);
    if (!Number.isInteger(value) || value < 2 || value > 100) return setError(copy.invalidCapacity);
    if (value < taken) return setError(copy.errors.capacity_below_occupied);
    startTransition(async () => {
      const result = await updateGroupSeats({ sessionId, capacity: value, openForBooking: open });
      if (result.status === "error") return setError(errorText(result.error));
      toast.success(copy.seatsSaved);
      setSheet(null);
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="secondary" block disabled={!canAdd} onClick={() => show("add")}>
          {copy.addParticipant}
        </Button>
        {full || candidates.length === 0 ? (
          <p className="px-1 text-footnote text-ink-2">{candidates.length === 0 ? copy.everyoneIn : capacity < 100 ? copy.fullHint : copy.fullMax}</p>
        ) : null}
        <Button type="button" variant="secondary" block onClick={() => show("seats")}>
          {copy.seats}
        </Button>
      </div>

      <Sheet
        open={sheet === "add"}
        onOpenChange={(next) => (next ? null : setSheet(null))}
        title={full ? copy.addExtraTitle : copy.addTitle}
        description={full ? copy.addExtraText : copy.addText}
        actions={
          <>
            <Button type="button" block loading={pending} onClick={add}>
              {copy.add}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setSheet(null)}>
              {copy.back}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="group-participant" className="px-1 text-footnote text-ink-2">
              {t.schedule.sessionForm.client}
            </label>
            <select
              id="group-participant"
              value={coachingId}
              onChange={(event) => {
                setCoachingId(event.target.value);
                setError(null);
              }}
              className={SELECT_CLASS}
            >
              <option value="">{t.schedule.sessionForm.chooseClient}</option>
              {candidates.map((client) => (
                <option key={client.coachingId} value={client.coachingId}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p role="alert" className="text-subhead text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "seats"}
        onOpenChange={(next) => (next ? null : setSheet(null))}
        title={copy.seatsTitle}
        actions={
          <>
            <Button type="button" block loading={pending} onClick={saveSeats}>
              {t.schedule.sessionForm.save}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setSheet(null)}>
              {copy.back}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label={copy.capacity}
            type="number"
            inputMode="numeric"
            min={Math.max(2, taken)}
            max={100}
            value={seats}
            onChange={(event) => {
              setSeats(event.target.value);
              setError(null);
            }}
          />
          <Switch checked={open} onCheckedChange={setOpen} label={copy.openForBooking} hint={copy.openForBookingHint} showLabel />
          {error ? (
            <p role="alert" className="text-subhead text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
