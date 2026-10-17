"use client";

import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useTelegramBackButton, useTelegramVerticalSwipeLock } from "@/lib/telegram/mini-app";
import type { SheetPanel as Panel, SheetProps } from "./sheet-panel";

let SheetPanel: typeof Panel | null = null;
let loading: Promise<typeof Panel> | null = null;

/**
 * Loads the animated part of every sheet (sheet-panel.tsx, with motion/react). Sheets start it after the
 * page's first render, so it is usually there before anyone taps; tests await it once up front.
 */
export function preloadSheet(): Promise<typeof Panel> {
  loading ??= import("./sheet-panel").then((module) => (SheetPanel = module.SheetPanel));
  return loading;
}

/**
 * Bottom sheet for a short action over the screen: a confirmation, a choice or a quick form
 * (docs/design/components/Sheet). From 768px on it turns into a centered 480px dialog.
 *
 * Built on Radix Dialog, so focus is trapped and Escape or a tap on the scrim closes it. On phones it
 * also closes when dragged down, and inside Telegram the BackButton closes it while it is open
 * (Telegram's own vertical swipes are off meanwhile).
 * The content stays mounted until its exit animation has played. A sheet opened before its panel has
 * loaded shows up as soon as it arrives.
 */
export function Sheet(props: SheetProps) {
  const { open, onOpenChange } = props;
  const [loaded, setLoaded] = useState(SheetPanel !== null);

  useTelegramBackButton(open ? () => onOpenChange(false) : null);
  // Telegram's swipe down to minimize would take the drag that closes the sheet.
  useTelegramVerticalSwipeLock(open);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    void preloadSheet().then(() => {
      if (live) setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [loaded]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {loaded && SheetPanel ? <SheetPanel {...props} /> : null}
    </Dialog.Root>
  );
}
