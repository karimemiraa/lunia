import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";

// Two clean, highly legible families — one per script — used for EVERYTHING:
// body copy, headings, figures, times and prices. (The previous decorative
// display faces, Cormorant Garamond and Noto Kufi Arabic, had old-style
// numerals and heavy Kufi shapes that made times/numbers hard to read.)
// next/font self-hosts and subsets them at build time: no runtime request to
// Google, minimal layout shift. Headings keep their hierarchy through size and
// weight; --font-display / --font-display-ar now resolve to these same
// families (see the @theme block in globals.css), so nothing that reads them
// needs to change.

// Latin — Inter (variable weight; lining, tabular-capable figures).
export const fontBody = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Arabic — IBM Plex Sans Arabic (pairs with Inter; includes matching Latin).
export const fontBodyAr = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body-ar",
  display: "swap",
});

// Applied together on <html> in every layout so both variables resolve for
// either locale regardless of which script is active.
export const fontVariables = [fontBody.variable, fontBodyAr.variable].join(" ");
