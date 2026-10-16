import { ClipboardList, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary } from "@/i18n/server";
import { loadClientIntake, loadTrainerIntake, SIGNED_OUT } from "@/lib/intake/load";
import { clientIntakePath, intakeConsentPath, trainerIntakePath } from "@/lib/intake/paths";

/**
 * "Анкета" on the client's card of a trainer (screens.md "Тренер (моя пара)"): the consent question while it
 * is unanswered, then the intake with whether this trainer sees it.
 */
export async function ClientIntakeRows({ coachingId }: { coachingId: string }) {
  const [t, intake] = await Promise.all([getDictionary(), loadClientIntake(coachingId)]);
  if (!intake || intake === SIGNED_OUT) return null;
  const copy = t.intake.card;
  return (
    <ListGroup header={copy.title}>
      {intake.live && !intake.decided ? (
        <ListRow
          icon={ShieldQuestion}
          iconTone="accent"
          title={copy.consent}
          subtitle={copy.consentText}
          href={intakeConsentPath(intake.coachingId)}
        />
      ) : null}
      <ListRow
        icon={ClipboardList}
        title={intake.latest ? copy.filled : t.intake.form.title}
        subtitle={intake.latest ? undefined : copy.notFilled}
        value={intake.live && intake.decided ? (intake.shared ? copy.shown : copy.hidden) : undefined}
        href={clientIntakePath(intake.coachingId)}
      />
    </ListGroup>
  );
}

/** The intake row on the trainer's overview of a client: its state and the PAR-Q flag (INTK-2, INTK-3). */
export async function TrainerIntakeRow({ coachingId }: { coachingId: string }) {
  const [t, intake] = await Promise.all([getDictionary(), loadTrainerIntake(coachingId)]);
  if (!intake || intake === SIGNED_OUT) return null;
  const copy = t.intake.card;
  const value =
    intake.state === "hidden" ? copy.hiddenByClient : intake.state === "empty" ? copy.notFilled : intake.latest.parqFlagged ? null : copy.filled;
  return (
    <ListGroup>
      <ListRow
        icon={ClipboardList}
        title={t.intake.trainer.title}
        value={value ?? undefined}
        trailing={
          intake.state === "filled" && intake.latest.parqFlagged ? <Badge tone="danger">{t.intake.trainer.parqFlag}</Badge> : undefined
        }
        href={trainerIntakePath(intake.coachingId)}
      />
    </ListGroup>
  );
}
