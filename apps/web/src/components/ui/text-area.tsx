import { useId } from "react";
import { cn } from "@/lib/utils";

type TextAreaProps = React.ComponentProps<"textarea"> & {
  /** Always visible above the field; a placeholder never replaces it. */
  label: string;
  /** Explanation under the field. */
  hint?: string;
  /** What is wrong and how to fix it: replaces the hint and turns the border `danger`. */
  error?: string;
};

/** Several lines of text ("О себе"), with the same label, hint and error as TextField. */
export function TextArea({ label, hint, error, className, id, rows = 4, ...textarea }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;

  return (
    <div data-slot="text-area" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="px-1 text-footnote text-ink-2">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn(
          "min-h-26 resize-y rounded-sm border bg-field px-4 py-3.5 text-body text-ink outline-none placeholder:text-ink-3",
          "transition-[border-color] duration-[var(--duration-instant)] focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)] motion-reduce:transition-none",
          error ? "border-danger" : "border-field-line",
        )}
        {...textarea}
      />
      {note ? (
        <p id={noteId} className={cn("px-1 text-footnote", error ? "text-danger" : "text-ink-2")}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
