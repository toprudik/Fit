"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { archiveLocation, saveLocation, type LocationState } from "@/lib/trainer-wizard/actions";

export type Place = { id: string; name: string; address: string | null };

const IDLE: LocationState = { status: "idle" };

/** Name and address of a place: a new one without `place`, else that place's own fields to change. */
function LocationForm({ place, onSaved }: { place: Place | null; onSaved: () => void }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.edit.locations;
  const fields = t.trainerWizard.steps.locations;
  const [state, action, pending] = useActionState(saveLocation, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;
  const invalid = (field: string) => state.status === "invalid" && state.fields.includes(field);
  const sent = (name: string, fallback: string) => {
    const typed = values?.[name];
    return typeof typed === "string" ? typed : fallback;
  };

  useEffect(() => {
    if (state.status !== "saved") return;
    toast.success(copy.saved);
    onSaved();
  }, [state, copy.saved, onSaved]);

  return (
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4" noValidate>
      {place ? <input type="hidden" name="id" value={place.id} /> : null}
      <TextField
        name="name"
        label={fields.name}
        placeholder={fields.namePlaceholder}
        defaultValue={sent("name", place?.name ?? "")}
        error={invalid("name") ? fields.nameError : undefined}
        maxLength={80}
        autoComplete="off"
      />
      <TextField
        name="address"
        label={fields.address}
        hint={fields.addressHint}
        defaultValue={sent("address", place?.address ?? "")}
        maxLength={200}
        autoComplete="street-address"
      />
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {t.trainerWizard.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {place ? t.trainerWizard.edit.save : copy.add}
      </Button>
    </form>
  );
}

type LocationListProps = {
  header?: string;
  locations: Place[];
  /** "Добавить место" under the list, on "Профиль тренера"; the wizard step has its own form for that. */
  canAdd?: boolean;
};

/**
 * The trainer's places, each with "Изменить" and "Удалить" (PRD wave-1 §2.3). Deleting archives the
 * place: new sessions can't be put there, and the ones already there keep it.
 */
export function LocationList({ header, locations, canAdd = false }: LocationListProps) {
  const { t } = useI18n();
  const copy = t.trainerWizard.edit.locations;
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [removing, setRemoving] = useState<Place | null>(null);
  const [pending, startTransition] = useTransition();
  const closeEditor = useCallback(() => setEditing(null), []);

  function remove(place: Place) {
    startTransition(async () => {
      const { failed } = await archiveLocation(place.id);
      if (failed) {
        toast.error(t.trainerWizard.failed);
        return;
      }
      toast.success(copy.removed);
      setRemoving(null);
    });
  }

  return (
    <section aria-label={header ?? t.trainerWizard.steps.locations.title} className="flex flex-col gap-3">
      {header ? <h2 className="px-1 text-footnote text-ink-2">{header}</h2> : null}
      {locations.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-lg bg-surface-1">
          {locations.map((place) => (
            <li key={place.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <MapPin aria-hidden className="size-5 shrink-0 text-ink-2" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body break-words">{place.name}</span>
                {place.address ? <span className="text-footnote break-words text-ink-2">{place.address}</span> : null}
              </div>
              <Button size="sm" variant="ghost" icon={Pencil} aria-label={`${copy.edit}: ${place.name}`} onClick={() => setEditing(place)}>
                <span className="sr-only md:not-sr-only">{copy.edit}</span>
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={`${copy.remove}: ${place.name}`} onClick={() => setRemoving(place)}>
                <span className="sr-only md:not-sr-only">{copy.remove}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-subhead text-ink-2">{t.trainerWizard.edit.noLocations}</p>
      )}
      {canAdd ? (
        <Button variant="secondary" size="lg" block icon={Plus} onClick={() => setEditing("new")}>
          {copy.add}
        </Button>
      ) : null}

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))} title={editing === "new" ? copy.add : copy.editTitle}>
        {editing !== null ? <LocationForm key={editing === "new" ? "new" : editing.id} place={editing === "new" ? null : editing} onSaved={closeEditor} /> : null}
      </Sheet>
      <Sheet
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title={copy.removeTitle}
        description={copy.removeText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={() => removing && remove(removing)}>
              {copy.remove}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setRemoving(null)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </section>
  );
}
