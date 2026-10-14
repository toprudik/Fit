import localFont from "next/font/local";

/**
 * DaFit fonts (docs/design/fonts, OFL licenses next to the files). Onest sets all interface text;
 * Tektur Narrow (Tektur with the width axis fixed at 75) is only for numerals from 32 px.
 */
export const onest = localFont({
  src: "./onest-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-onest",
});

export const tekturNarrow = localFont({
  src: "./tektur-narrow.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-tektur-narrow",
  // Only large numerals use it, and most screens have none: load on demand.
  preload: false,
});
