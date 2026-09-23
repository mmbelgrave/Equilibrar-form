// The four faces of spec v2 §9, self-hosted from `src/fonts` through next/font/local.
// next/font writes the @font-face rules itself, so the file URLs stay correct even when the
// site is served from a sub-folder (GitHub Pages). Nothing is ever fetched from Google.
//
// Each family is loaded twice: the Latin subset (which covers Portuguese — á ã ç ê õ) and the
// Latin-Extended subset behind it in the font stack, so a rare extra letter still has a face.
// next/font only accepts literal values, so the two subsets cannot share one loader.
import localFont from "next/font/local";

/** Wordmark only, one weight (spec §9). */
const poiret = localFont({
  src: "../fonts/poiret-one-latin-400-normal.woff2",
  display: "swap",
  variable: "--font-poiret",
  fallback: ["Century Gothic", "Futura", "system-ui", "sans-serif"],
});
const poiretExt = localFont({
  src: "../fonts/poiret-one-latin-ext-400-normal.woff2",
  display: "swap",
  variable: "--font-poiret-ext",
  fallback: ["Century Gothic", "Futura", "system-ui", "sans-serif"],
});

/** Headings and numbers. */
const jost = localFont({
  src: [
    { path: "../fonts/jost-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../fonts/jost-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jost-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-jost",
  fallback: ["Century Gothic", "Futura", "system-ui", "sans-serif"],
});
const jostExt = localFont({
  src: [
    { path: "../fonts/jost-latin-ext-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../fonts/jost-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jost-latin-ext-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-jost-ext",
  fallback: ["Century Gothic", "Futura", "system-ui", "sans-serif"],
});

/** Everything she actually has to read. */
const lato = localFont({
  src: [
    { path: "../fonts/lato-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lato-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-lato",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});
const latoExt = localFont({
  src: [
    { path: "../fonts/lato-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lato-latin-ext-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-lato-ext",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

/** Lockup only, never in the interface (spec §9). */
const sacramento = localFont({
  src: "../fonts/sacramento-latin-400-normal.woff2",
  display: "swap",
  variable: "--font-sacramento",
  fallback: ["Segoe Script", "cursive"],
});
const sacramentoExt = localFont({
  src: "../fonts/sacramento-latin-ext-400-normal.woff2",
  display: "swap",
  variable: "--font-sacramento-ext",
  fallback: ["Segoe Script", "cursive"],
});

/** Put on <html>; `globals.css` builds the four roles from these variables. */
export const FONT_CLASSES = [
  poiret.variable,
  poiretExt.variable,
  jost.variable,
  jostExt.variable,
  lato.variable,
  latoExt.variable,
  sacramento.variable,
  sacramentoExt.variable,
].join(" ");
