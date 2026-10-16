import { useId } from "react";
import { cn } from "@/lib/utils";

type TextAreaProps = React.ComponentProps<"textarea"> & {
  /** Always visible above the field; a placeholder never replaces it. */
  label: string;
  hint?: string;
  /** What is wrong and how to fix it: replaces the hint and turns the border `danger`. */
  error?: string;
  className?: string;
};

/** Multi-line TextField (docs/design/components/TextField) for notes and reasons; grows with its text. */
export function TextArea({ label, hint, error, className, id, rows = 3, ...textarea }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;

  return (
    <div data-slot="text-area" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="px-1 text-footnote text-ink-2">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={cn(
          "min-h-26 w-full resize-none rounded-sm border bg-field px-4 py-3.5 text-body text-ink outline-none [field-sizing:content] placeholder:text-ink-3",
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
