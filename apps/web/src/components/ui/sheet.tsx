"use client";

import { X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type MotionProps,
  type PanInfo,
  type Target,
} from "motion/react";
import { Dialog } from "radix-ui";
import { useRef, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "@/i18n/client";
import { useTelegramBackButton } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Buttons at the bottom, in a column: the main one goes first. */
  actions?: React.ReactNode;
};

// Motion tokens from docs/design/tokens.json: motion/react takes seconds and bezier arrays, not CSS variables.
const DURATION = { instant: 0.1, base: 0.24, slow: 0.4 } as const;
const EASE_STANDARD = [0.2, 0.8, 0.2, 1] as const;
const EASE_EXIT = [0.4, 0, 1, 1] as const;

// Drag-to-dismiss: how far down (px) or how fast (px/s) the sheet must be let go to close.
const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 600;

type Presence = Pick<MotionProps, "initial" | "animate" | "exit">;

/** Enters with easing-standard and leaves with easing-exit. No spring: brand.md "Движение". */
function presence(hidden: Target, shown: Target, duration: number): Presence {
  return {
    initial: hidden,
    animate: { ...shown, transition: { duration, ease: EASE_STANDARD } },
    exit: { ...hidden, transition: { duration, ease: EASE_EXIT } },
  };
}

const FADE_REDUCED = presence({ opacity: 0 }, { opacity: 1 }, DURATION.instant);
// Both ends in percent, so the enter needs no layout measurement to convert units.
const SHEET = presence({ y: "100%" }, { y: "0%" }, DURATION.slow);
const SHEET_SCRIM = presence({ opacity: 0 }, { opacity: 1 }, DURATION.slow);
const DIALOG = presence({ opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1 }, DURATION.base);
const DIALOG_SCRIM = presence({ opacity: 0 }, { opacity: 1 }, DURATION.base);

// Tailwind's md breakpoint: below it the sheet comes from the bottom, from it on it is a centered dialog.
const DESKTOP_QUERY = "(min-width: 48rem)";

function subscribeDesktop(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isDesktop() {
  return typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Bottom sheet for a short action over the screen: a confirmation, a choice or a quick form
 * (docs/design/components/Sheet). From 768px on it turns into a centered 480px dialog.
 *
 * Built on Radix Dialog, so focus is trapped and Escape or a tap on the scrim closes it. On phones it
 * also closes when dragged down, and inside Telegram the BackButton closes it while it is open.
 * The content stays mounted until its exit animation has played.
 */
export function Sheet({ open, onOpenChange, title, description, children, actions }: SheetProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion() ?? false;
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const dragControls = useDragControls();
  const bodyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const draggedRef = useRef(false);

  useTelegramBackButton(open ? () => onOpenChange(false) : null);

  const panelMotion = reduceMotion ? FADE_REDUCED : desktop ? DIALOG : SHEET;
  const scrimMotion = reduceMotion ? FADE_REDUCED : desktop ? DIALOG_SCRIM : SHEET_SCRIM;
  const hasBody = children !== undefined && children !== null && children !== false;

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    draggedRef.current = false;
    if (desktop || !event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Fields keep caret placement and text selection; scrolled content scrolls back up before the sheet moves.
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (bodyRef.current?.contains(target) && bodyRef.current.scrollTop > 0) return;
    dragControls.start(event);
  }

  function endDrag(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount key="sheet">
            <Dialog.Overlay forceMount asChild>
              <motion.div
                {...scrimMotion}
                data-slot="sheet-scrim"
                // While the exit plays, taps already go through to the screen underneath.
                className="fixed inset-0 z-[var(--z-sheet)] bg-scrim data-[state=closed]:pointer-events-none!"
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              // Radix warns unless a missing description is declared explicitly.
              {...(description ? {} : { "aria-describedby": undefined })}
              onOpenAutoFocus={() => {
                // Radix returns focus to a Dialog.Trigger, but callers open the sheet with their own
                // button. Remember whatever had focus and return it there on close.
                openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const opener = openerRef.current;
                openerRef.current = null;
                if (opener?.isConnected) opener.focus({ preventScroll: true });
              }}
            >
              <motion.div
                {...panelMotion}
                drag={desktop ? false : "y"}
                dragListener={false}
                dragControls={dragControls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 1 }}
                dragTransition={{ bounceStiffness: 600, bounceDamping: 50 }}
                onPointerDown={startDrag}
                onDragStart={() => {
                  draggedRef.current = true;
                }}
                onDragEnd={endDrag}
                onClickCapture={(event) => {
                  // A mouse drag released over a button would click it; a touch drag never does.
                  if (!draggedRef.current) return;
                  draggedRef.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={cn(
                  "fixed z-[var(--z-sheet)] flex flex-col gap-4 bg-surface-1 shadow-float data-[state=closed]:pointer-events-none!",
                  "inset-x-0 bottom-0 max-h-[calc(100dvh-var(--safe-top)-var(--space-8))] rounded-t-xl pt-2",
                  "pb-[max(var(--space-6),var(--safe-bottom))]",
                  "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-[480px] md:max-w-[calc(100vw-var(--space-12))]",
                  "md:max-h-[calc(100dvh-var(--space-16))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:py-6",
                )}
              >
                <div className="flex shrink-0 touch-none flex-col gap-4 px-5 md:touch-auto md:px-6">
                  <div aria-hidden className="h-[5px] w-9 self-center rounded-full bg-surface-3 md:hidden" />
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Dialog.Title className="text-title-2 text-ink">{title}</Dialog.Title>
                      {description ? (
                        <Dialog.Description className="text-callout text-ink-2">{description}</Dialog.Description>
                      ) : null}
                    </div>
                    <Dialog.Close asChild>
                      {/* Phones close by drag, scrim or BackButton: there the button only shows for keyboard focus. */}
                      <IconButton
                        icon={X}
                        label={t.common.close}
                        className="-my-2 -mr-2.5 shrink-0 max-md:not-focus-visible:sr-only"
                      />
                    </Dialog.Close>
                  </div>
                </div>
                {hasBody ? (
                  // -my-1/py-1 leave room for focus rings that the scroll clipping would cut off.
                  <div ref={bodyRef} className="-my-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-1 md:px-6">
                    {children}
                  </div>
                ) : null}
                {actions ? <div className="flex shrink-0 flex-col gap-2 px-5 md:px-6">{actions}</div> : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
