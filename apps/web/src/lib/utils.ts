import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** DaFit type styles (tokens.json → --text-* in globals.css). */
export const TEXT_STYLES = [
  "num-hero",
  "num-xl",
  "num-lg",
  "large-title",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "callout",
  "subhead",
  "footnote",
  "caption",
] as const;

// Without this, tailwind-merge reads `text-headline` as a color and drops it next to `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TEXT_STYLES] }],
      shadow: [{ shadow: ["float"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
