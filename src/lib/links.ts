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

/**
 * Where she books the 30-minute conversation about her Map (Calendly, or any other booking
 * page — nothing here knows which). Empty until it is set, and then the invitation on the
 * confirmation screen is simply not shown.
 *
 * It is a plain link that opens in her own tab, not an embedded widget. The embed would
 * load a third party's JavaScript into the Map, and both the privacy notice and the README
 * say there are no third-party requests. A link keeps that true: nothing runs on our page,
 * and she chooses to go.
 *
 * `||`, not `??`: the deploy workflow passes this variable whether or not the repository
 * sets it, so an unset variable arrives as an empty string rather than undefined. With `??`
 * the empty string won and the invitation silently disappeared from the live site.
 */
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || "https://calendly.com/nutricao-renata/30min";
