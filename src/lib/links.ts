// Where "What next" sends her (spec §3, screen 6). PLACEHOLDERS until Renata's
// pathway and programme pages exist — replace these URLs, nothing else needs to change.
import type { Pillar } from "./scoring.ts";

export const PATHWAY_URL: Record<Pillar, string> = {
  space: "#pathway-space",
  routine: "#pathway-routine",
  sleep: "#pathway-sleep",
  calm: "#pathway-calm",
  food: "#pathway-food",
  strength: "#pathway-strength",
};

export const PROGRAMME_URL = "#programme";

/**
 * Rê's WhatsApp number in international form, digits only (for example "351912345678").
 * Empty until she gives it: the "Message Rê on WhatsApp" link is then simply not shown.
 */
export const RE_WHATSAPP = process.env.NEXT_PUBLIC_RE_WHATSAPP ?? "";
