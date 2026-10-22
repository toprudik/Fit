"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { ZoneOption } from "./step-fields";

/** Lower case, "_" and "/" as spaces, ё as е: "Europe/Moscow" and "europe moscow" match. */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е").replace(/[_/]/g, " ");
}

/** Every word of the query in the zone's id, name or offset, so "моск", "new york" and "+3" all find something. */
export function matchZones(zones: ZoneOption[], query: string): ZoneOption[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return zones;
  return zones.filter((zone) => {
    const haystack = normalize(`${zone.label} ${zone.name} ${zone.offset}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * The time zone field: shows the chosen zone and opens a sheet with a search over the whole list (QA T15), since a
 * native select of 400 English names has no search on a phone. The value goes with the form in a hidden input.
 */
export function TimeZonePicker({
  name,
  label,
  zones,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  zones: ZoneOption[];
  value: string;
  onChange: (zone: string) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const copy = t.trainerWizard.steps.region;
  const labelId = useId();
  const valueId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = zones.find((zone) => zone.id === value);
  const found = matchZones(zones, query);

  return (
    <>
      <span id={labelId} className="px-1 text-footnote text-ink-2">
        {label}
      </span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={error ? errorId : undefined}
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className={cn(
          "flex h-13 w-full cursor-pointer items-center gap-2 rounded-sm border bg-field px-4 text-left outline-none",
          "focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_1px_var(--focus-ring)]",
          error ? "border-danger" : "border-field-line",
        )}
      >
        <span id={valueId} className="min-w-0 flex-1 truncate text-body text-ink">
          {chosen ? `${chosen.label}${chosen.offset ? ` (${chosen.offset})` : ""}` : value}
        </span>
        <ChevronDown aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" />
      </button>
      {error ? (
        <p id={errorId} className="px-1 text-footnote text-danger">
          {error}
        </p>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <div className="flex flex-col gap-4 pb-4">
          <TextField
            type="search"
            label={copy.search}
            hint={copy.searchHint}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          {found.length > 0 ? (
            <ListGroup surface="raised">
              {found.map((zone) => (
                <ListRow
                  key={zone.id}
                  title={zone.label}
                  subtitle={zone.name || undefined}
                  value={zone.offset || undefined}
                  chevron={false}
                  trailing={
                    zone.id === value ? <Check aria-label={copy.chosen} size={20} strokeWidth={2} className="shrink-0 text-ink" /> : null
                  }
                  onClick={() => {
                    onChange(zone.id);
                    setOpen(false);
                  }}
                />
              ))}
            </ListGroup>
          ) : (
            <p role="status" className="px-1 text-callout text-ink-2">
              {copy.searchEmpty}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
