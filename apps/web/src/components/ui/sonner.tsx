"use client";

import { Check, CircleAlert, Info } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n/client";

// Tone is carried by the icon's shape and the words, never by color alone (Toast README).
const ICON_PROPS = { "aria-hidden": true, size: 20, strokeWidth: 1.75 } as const;
const ICONS: ToasterProps["icons"] = {
  success: <Check {...ICON_PROPS} />,
  info: <Info {...ICON_PROPS} />,
  warning: <CircleAlert {...ICON_PROPS} />,
  error: <CircleAlert {...ICON_PROPS} />,
  loading: <Spinner />,
};

// Below the status bar and Telegram's header.
const TOP_OFFSET = "calc(var(--safe-top) + var(--space-3))";

// The action ("Отменить") is bold on-inverse text; a taller invisible hit area keeps the 44 px target.
const TOAST_BUTTON =
  "relative inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3 text-subhead text-on-inverse " +
  "underline-offset-3 hover:underline after:absolute after:inset-x-0 after:-inset-y-1.5";

/**
 * DaFit Toast (docs/design/components/Toast + `.df-toast`): an inverse pill with an icon and a few
 * words that repeat the button's verb ("Записано"), at the top center. Sonner keeps the queue,
 * swipe to dismiss and its polite live region; the look is ours (`unstyled`).
 */
function Toaster(props: ToasterProps) {
  const { t } = useI18n();
  return (
    <Sonner
      position="top-center"
      offset={{ top: TOP_OFFSET }}
      // Edge to edge on phones, so the pill is centered on the screen.
      mobileOffset={{ top: TOP_OFFSET, left: 0, right: 0 }}
      gap={8}
      containerAriaLabel={t.toast.region}
      icons={ICONS}
      // Inline: Sonner's own stylesheet is unlayered and would beat Tailwind classes.
      style={{ zIndex: "var(--z-toast)" }}
      toastOptions={{
        unstyled: true,
        // A pill as wide as its content, centered in Sonner's column instead of stretched across it.
        style: { left: "50%", right: "auto", width: "max-content", maxWidth: "calc(100vw - 2 * var(--space-4))", translate: "-50% 0" },
        classNames: {
          toast:
            "flex min-h-12 items-center gap-3 overflow-hidden rounded-full bg-inverse px-4 py-2 text-subhead font-medium " +
            "text-on-inverse shadow-float has-[[data-button]]:pr-2 " +
            // Toasts take focus with alt+T; Sonner's stylesheet removes the outline, so ours is forced back.
            "focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-focus-ring!",
          icon: "relative grid size-5 shrink-0 place-items-center",
          content: "flex min-w-0 flex-col",
          description: "text-footnote",
          actionButton: `${TOAST_BUTTON} font-bold`,
          cancelButton: `${TOAST_BUTTON} font-medium`,
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
