// Everything the Map keeps lives in this browser (Phase 1). Every access is guarded:
// private windows and blocked storage must never break the questionnaire.
import {
  CARING,
  QUESTION_COUNT,
  STAGES,
  TREATMENT,
  emptyContext,
  parseResult,
  type Answers,
  type Context,
  type MapResult,
} from "./scoring.ts";

export type Screen = "welcome" | "about" | "flow" | "checkin" | "result" | "next";
export const SCREENS: Screen[] = ["welcome", "about", "flow", "checkin", "result", "next"];

/** "about": intro + C1–C6 = positions 0…6. "flow": 6 dividers + 24 questions = 0…29. */
export const ABOUT_LENGTH = 7;
export const FLOW_LENGTH = 30;

export type SavedState = {
  v: 2;
  screen: Screen;
  pos: number;
  /** Kept only until the result exists, then cleared (spec §12: scores are enough). */
  answers: Answers;
  context: Context;
  /**
   * C6, her own words, and its separate consent. Local only and dropped when the result
   * is made: in Phase 1 nothing is sent anywhere. It is never put in the result object.
   */
  note: { text: string; consent: boolean };
  /** The last finished Map. Kept while a re-take is in progress, replaced when it finishes. */
  result: MapResult | null;
  /** The wheel animates once, on the first render of a result. */
  animated: boolean;
};

export const STATE_KEY = "eq.v2";
const OLD_KEYS = ["eq.v1"];
export const LOCALE_KEY = "eq.locale";

export function emptyState(): SavedState {
  return {
    v: 2,
    screen: "welcome",
    pos: 0,
    answers: Array(QUESTION_COUNT).fill(null),
    context: emptyContext(),
    note: { text: "", consent: false },
    result: null,
    animated: false,
  };
}

const isLevel = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;

function validAnswers(a: unknown): a is Answers {
  return Array.isArray(a) && a.length === QUESTION_COUNT && a.every((x) => x === null || isLevel(x));
}

function parseContext(c: unknown): Context {
  const base = emptyContext();
  if (!c || typeof c !== "object") return base;
  const r = c as Record<string, unknown>;
  return {
    stage: (STAGES as readonly unknown[]).includes(r.stage) ? (r.stage as Context["stage"]) : null,
    caring: (CARING as readonly unknown[]).includes(r.caring) ? (r.caring as Context["caring"]) : null,
    support: isLevel(r.support) ? (r.support as Context["support"]) : null,
    flex: isLevel(r.flex) || r.flex === "na" ? (r.flex as Context["flex"]) : null,
    treatment: (TREATMENT as readonly unknown[]).includes(r.treatment) ? (r.treatment as Context["treatment"]) : null,
  };
}

/** Pure: raw localStorage text → a safe state. Anything unexpected falls back to defaults. */
export function parseState(raw: string | null): { state: SavedState; resultLost: boolean } {
  const base = emptyState();
  if (!raw) return { state: base, resultLost: false };
  let s: Record<string, unknown>;
  try {
    s = JSON.parse(raw);
  } catch {
    return { state: base, resultLost: false };
  }
  if (!s || typeof s !== "object" || s.v !== 2) return { state: base, resultLost: false };
  const result = parseResult(s.result);
  const resultLost = s.result != null && result === null;
  let screen = SCREENS.includes(s.screen as Screen) ? (s.screen as Screen) : "welcome";
  const max = screen === "about" ? ABOUT_LENGTH : FLOW_LENGTH;
  const pos = Number.isInteger(s.pos) && (s.pos as number) >= 0 && (s.pos as number) < max ? (s.pos as number) : 0;
  if ((screen === "result" || screen === "next") && !result) screen = "welcome";
  const note = s.note as { text?: unknown; consent?: unknown } | undefined;
  return {
    state: {
      ...base,
      screen,
      pos,
      answers: validAnswers(s.answers) ? s.answers : base.answers,
      context: parseContext(s.context),
      note: {
        text: typeof note?.text === "string" ? note.text.slice(0, 2000) : "",
        consent: note?.consent === true,
      },
      result,
      animated: s.animated === true,
    },
    resultLost,
  };
}

export function loadState(): { state: SavedState; resultLost: boolean } {
  try {
    for (const k of OLD_KEYS) window.localStorage.removeItem(k); // earlier test versions
    return parseState(window.localStorage.getItem(STATE_KEY));
  } catch {
    return { state: emptyState(), resultLost: false };
  }
}

/** Returns false when the browser refuses to store (private mode, full, blocked). */
export function saveState(state: SavedState): boolean {
  try {
    // Her own words (C6) are written to the device only once she has ticked their consent
    // (spec §4); until then they live in memory for this visit only.
    const note = state.note.consent ? state.note : { text: "", consent: false };
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ ...state, note }));
    return true;
  } catch {
    return false;
  }
}

export function loadLocale(): "pt" | "en" | null {
  try {
    const v = window.localStorage.getItem(LOCALE_KEY);
    return v === "pt" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function saveLocale(locale: "pt" | "en"): void {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* the URL still carries the language */
  }
}

/** "Delete my Map from this browser": the Map and the remembered language. */
export function clearEverything(): void {
  try {
    for (const k of [STATE_KEY, LOCALE_KEY, ...OLD_KEYS]) window.localStorage.removeItem(k);
  } catch {
    /* nothing stored */
  }
}
