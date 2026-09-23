// Copy lives in flat JSON (key → string), one file per locale, so it can be edited
// in a sheet (spec §11). next-intl wants nested objects, so the keys are unflattened here.
import en from "../messages/en.json";
import pt from "../messages/pt.json";

export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];

type Nested = { [key: string]: string | Nested };

function unflatten(flat: Record<string, string>): Nested {
  const out: Nested = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== "object") node[part] = {};
      node = node[part] as Nested;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

export const FLAT_MESSAGES: Record<Locale, Record<string, string>> = { pt, en };
export const MESSAGES: Record<Locale, Nested> = { pt: unflatten(pt), en: unflatten(en) };

/**
 * Where the site lives. Empty on its own domain; "/<repo>" when GitHub Pages serves it
 * from a sub-folder. Set at build time by NEXT_PUBLIC_BASE_PATH.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** A file in `public/`, with the base path in front. */
export const asset = (path: string) => `${BASE_PATH}${path}`;

/** Language lives in the URL (spec §11). */
export const PATHS: Record<Locale, { map: string; privacy: string }> = {
  pt: { map: `${BASE_PATH}/pt/mapa`, privacy: `${BASE_PATH}/pt/privacidade` },
  en: { map: `${BASE_PATH}/en/map`, privacy: `${BASE_PATH}/en/privacy` },
};

export const HTML_LANG: Record<Locale, string> = { pt: "pt-BR", en: "en" };

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 22/09/2026 in Portuguese, 22 Sep 2026 in English (spec §11). */
export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  const day = d.getDate();
  if (locale === "pt") {
    return `${String(day).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
