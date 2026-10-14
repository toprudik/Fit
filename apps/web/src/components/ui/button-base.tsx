"use client";

import { Slot } from "radix-ui";
import { Spinner } from "@/components/ui/spinner";
import { hapticImpact } from "@/lib/telegram/mini-app";

type ButtonBaseProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  /** The rendered icon, or null. The spinner takes its place while loading. */
  icon: React.ReactNode;
  loading: boolean;
  /** Light impact vibration on press (Telegram, or navigator.vibrate on the web). */
  haptic: boolean;
};

/**
 * The interactive half of `Button`: press feedback, the loading layout and `asChild` slotting.
 * `Button` itself stays server-safe, so a Server Component can hand it a Lucide icon (a function
 * cannot cross into a Client Component as a prop) and call `buttonVariants`.
 */
export function ButtonBase({ asChild = false, icon, loading, haptic, disabled, type, onClick, children, ...props }: ButtonBaseProps) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (haptic && !event.defaultPrevented) hapticImpact();
  }

  // Without an icon there is no place for the spinner, so it covers the label instead. The label
  // stays in the layout and the accessibility tree: the width and the button's name don't change.
  const coverLabel = loading && !icon;
  const leading = loading && icon ? (
    <span className="grid size-5 shrink-0 place-items-center">
      <Spinner />
    </span>
  ) : (
    icon
  );
  const label = (content: React.ReactNode) => (coverLabel ? <span className="opacity-0">{content}</span> : content);
  const overlay = coverLabel ? (
    <span className="absolute inset-0 grid place-items-center">
      <Spinner />
    </span>
  ) : null;

  if (asChild) {
    return (
      <Slot.Root aria-disabled={disabled || loading || undefined} aria-busy={loading || undefined} onClick={handleClick} {...props}>
        {leading}
        <Slot.Slottable child={children}>{label}</Slot.Slottable>
        {overlay}
      </Slot.Root>
    );
  }

  return (
    <button type={type ?? "button"} disabled={disabled || loading} aria-busy={loading || undefined} onClick={handleClick} {...props}>
      {leading}
      {label(children)}
      {overlay}
    </button>
  );
}
