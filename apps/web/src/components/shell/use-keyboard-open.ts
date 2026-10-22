"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Inputs that bring up no on-screen keyboard. */
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** True for a focused element a phone types into with its on-screen keyboard. */
function typesText(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) return !element.readOnly && !NO_KEYBOARD.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

function subscribe(onChange: () => void) {
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

/**
 * Whether the on-screen keyboard is up, judged by focus: a phone shows it for a text field and
 * nothing else. The browser and Telegram resize the viewport differently (or not at all), so the
 * focus is the one signal that works in both. False on the server.
 */
export function useKeyboardOpen(): boolean {
  const open = useSyncExternalStore(subscribe, () => typesText(document.activeElement), () => false);

  // Once the keyboard has taken its place, the focused field moves to the middle of what is left
  // (QA 22.10: «Название» of a new session stayed below the keyboard).
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const onResize = () => {
      const field = document.activeElement;
      if (!typesText(field)) return;
      const { top, bottom } = field.getBoundingClientRect();
      if (top < viewport.offsetTop || bottom > viewport.offsetTop + viewport.height) field.scrollIntoView({ block: "center" });
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, [open]);

  return open;
}
