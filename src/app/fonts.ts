import { Cormorant_Garamond, IBM_Plex_Sans_Arabic, Inter, Noto_Kufi_Arabic } from "next/font/google";

// Real, self-hosted web fonts (next/font/google downloads + subsets them at
// build time, so there is no runtime request to Google's CDN and no layout
// shift beyond the `swap` window). Each font's `variable` name matches a
// CSS custom property already declared as a fallback stack in
// src/app/globals.css's `@theme` block — loading the font here simply
// upgrades that variable's value from a generic fallback to the real
// typeface; nothing that already reads `var(--font-display)` etc. needs to
// change.
//
// Display (serif, headlines/pull-quotes):
export const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Body (sans, running text/nav) — Latin:
export const fontBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Display (Arabic headlines):
export const fontDisplayAr = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display-ar",
  display: "swap",
});

// Body (Arabic running text/nav):
export const fontBodyAr = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-body-ar",
  display: "swap",
});

// Applied together on <html> in the (site) layout so all four brand font
// variables resolve for both locales regardless of which script is active.
export const fontVariables = [
  fontDisplay.variable,
  fontBody.variable,
  fontDisplayAr.variable,
  fontBodyAr.variable,
].join(" ");
