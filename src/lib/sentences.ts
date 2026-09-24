// Joining answers inside a sentence, and the wheel's geometry: the two pieces of the
// result screen that are easy to get subtly wrong, kept pure so they can be tested.

/**
 * Several answers in one sentence. Many fragments contain "e" / "and" themselves
 * ("digestão e intestino", "life got busy and time ran out"), so joining them with another
 * "and" gives a chain nobody can untangle (review 4, finding 1). Commas do not have that
 * problem, and the last item is separated the same way.
 */
export function joinFragments(locale: "pt" | "en", items: string[]): string {
  void locale; // both languages join the same way; kept so callers read naturally
  const clean = items.map((s) => s.trim()).filter(Boolean);
  // Intl.ListFormat still puts "e" before the last item in Portuguese, even in its "unit"
  // form, so the joining is done here: commas only.
  return clean.join(", ");
}

/** Her own words, ready to sit inside “…” — without ending up with two full stops. */
export const quoteReady = (text: string): string => text.trim().replace(/[.。!?\s]+$/u, "");

/* ------------------------------------------------------------------ the wheel ---- */

export const WHEEL = {
  /** Space between the ring and a label, in px. */
  gap: 4,
  /** Largest and smallest radius, in px. */
  max: 170,
  min: 56,
  cos30: Math.cos(Math.PI / 6),
};

/** Once the labels have been made smaller, they only grow back with this much room to
 * spare, so the wheel cannot flip between the two sizes on the same screen. */
export const TIGHT_HYSTERESIS = 30;

export type WheelLayout = { r: number; cx: number; cy: number; height: number; fits: boolean; ideal: number };

/**
 * Sizes the wheel to the room the real labels leave. The two side labels sit at 60° from
 * the top, so they, not the wheel, decide the width. `fits` is false when even the smallest
 * wheel would push a label past the edge — the caller then shrinks the labels instead.
 */
export function wheelLayout(width: number, labelWidths: number[], labelHeights: number[]): WheelLayout {
  const leftMax = Math.max(labelWidths[4] ?? 0, labelWidths[5] ?? 0);
  const rightMax = Math.max(labelWidths[1] ?? 0, labelWidths[2] ?? 0);
  const room = width - leftMax - rightMax;
  const ideal = room / (2 * WHEEL.cos30) - WHEEL.gap;
  const r = Math.max(WHEEL.min, Math.min(WHEEL.max, ideal));
  const spread = WHEEL.cos30 * (r + WHEEL.gap);
  const slack = Math.max(0, room - 2 * spread);
  return {
    r,
    cx: leftMax + spread + slack / 2,
    cy: (labelHeights[0] ?? 0) + WHEEL.gap + r,
    height: (labelHeights[0] ?? 0) + WHEEL.gap + 2 * r + WHEEL.gap + (labelHeights[3] ?? 0),
    fits: ideal >= WHEEL.min,
    ideal,
  };
}
