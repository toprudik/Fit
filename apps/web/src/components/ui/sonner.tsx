"use client";

import { Check, CircleAlert, Info } from "lucide-react";
import { toast as sonnerToast, Toaster as Sonner, type ExternalToast, type ToasterProps } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/i18n/client";
import { useInTelegram } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

// Tone is carried by the icon's shape and the words, never by color alone (Toast README).
const ICON_PROPS = { "aria-hidden": true, size: 20, strokeWidth: 1.75 } as const;
const ICONS: ToasterProps["icons"] = {
  success: <Check {...ICON_PROPS} />,
  info: <Info {...ICON_PROPS} />,
  warning: <CircleAlert {...ICON_PROPS} />,
  error: <CircleAlert {...ICON_PROPS} />,
  loading: <Spinner />,
};

/*
 * In the Mini App toasts come from the top, below the status bar and Telegram's header. On the
 * website they rise from the bottom: above the tab bar on phones, near the edge from 768px on,
 * where the side menu replaces the tab bar. Sonner switches to its mobile offsets below 600px, so
 * both sets point at the same values and the 768px breakpoint lives in CSS (TOASTER below).
 */
const TOP = "calc(var(--safe-top) + var(--space-3))";
const BOTTOM = "var(--toast-offset-bottom)";
const OFFSET: ToasterProps["offset"] = { top: TOP, bottom: BOTTOM };
// Edge to edge on phones, so the pill is centered on the screen.
const MOBILE_OFFSET: ToasterProps["mobileOffset"] = { top: TOP, bottom: BOTTOM, left: 0, right: 0 };
const TOASTER =
  "[--toast-offset-bottom:calc(var(--size-tabbar)+var(--safe-bottom)+var(--space-3))] md:[--toast-offset-bottom:var(--space-6)]";

// The action ("Отменить") is bold on-inverse text; a taller invisible hit area keeps the 44 px target.
const TOAST_BUTTON =
  "relative inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3 text-subhead text-on-inverse " +
  "underline-offset-3 hover:underline after:absolute after:inset-x-0 after:-inset-y-1.5";

/**
 * DaFit Toast (docs/design/components/Toast + `.df-toast`): an inverse pill with an icon and a few
 * words that repeat the button's verb ("Записано"), at the top center inside Telegram and at the
 * bottom center on the website. Sonner keeps the queue, swipe to dismiss and its polite live
 * region; the look is ours (`unstyled`). Show toasts with `toast` from this module.
 */
function Toaster({ className, ...props }: ToasterProps) {
  const { t } = useI18n();
  const inTelegram = useInTelegram();
  return (
    <Sonner
      position={inTelegram ? "top-center" : "bottom-center"}
      offset={OFFSET}
      mobileOffset={MOBILE_OFFSET}
      className={cn(TOASTER, className)}
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

/** A toast stays 4 s (Sonner's default), or 6 s when it has an action to take (Toast README). */
export const ACTION_TOAST_DURATION = 6000;

type Show = (message: Parameters<typeof sonnerToast.message>[0], data?: ExternalToast) => string | number;

function withActionDuration(show: Show): Show {
  return (message, data) =>
    show(message, data?.action !== undefined && data.duration === undefined ? { ...data, duration: ACTION_TOAST_DURATION } : data);
}

/** Sonner's `toast`, with the longer default for toasts that carry an action. An explicit duration wins. */
const toast: typeof sonnerToast = Object.assign(withActionDuration(sonnerToast), {
  ...sonnerToast,
  success: withActionDuration(sonnerToast.success),
  info: withActionDuration(sonnerToast.info),
  warning: withActionDuration(sonnerToast.warning),
  error: withActionDuration(sonnerToast.error),
  message: withActionDuration(sonnerToast.message),
});

export { Toaster, toast };
