import { useId } from "react";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<React.ComponentProps<"input">, "size"> & {
  /** Always visible above the field; a placeholder never replaces it. */
  label: string;
  /** Explanation under the field. */
  hint?: string;
  /** What is wrong and how to fix it: replaces the hint and turns the border `danger`. */
  error?: string;
  /** Unit on the right: «кг», «₽», «дней». */
  suffix?: string;
  className?: string;
};

/**
 * Text field with a label above and a hint or error below (docs/design/components/TextField). Every
 * other prop goes to the `<input>`; numbers get `inputMode="numeric"` or `"decimal"` from the caller.
 */
export function TextField({ label, hint, error, suffix, className, id, ...input }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;

  return (
    <div data-slot="text-field" className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="px-1 text-footnote text-ink-2">
        {label}
      </label>
      <div
        className={cn(
          "flex h-13 items-center gap-2 rounded-sm border bg-field px-4 transition-[border-color] duration-[var(--duration-instant)]",
          "focus-within:border-focus-ring focus-within:shadow-[0_0_0_1px_var(--focus-ring)] motion-reduce:transition-none",
          error ? "border-danger" : "border-field-line",
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          {...input}
        />
        {suffix ? <span className="text-subhead text-ink-2">{suffix}</span> : null}
      </div>
      {note ? (
        <p id={noteId} className={cn("px-1 text-footnote", error ? "text-danger" : "text-ink-2")}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
