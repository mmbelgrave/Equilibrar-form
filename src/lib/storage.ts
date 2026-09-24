// Everything the Map keeps lives in this browser (Phase 1). Every access is guarded:
// private windows and blocked storage must never break the questionnaire.
import { emptyPersonal, type Personal } from "./conclusion.ts";
import {
  AGE_BANDS,
  CARING,
  DURATIONS,
  LIFE_STAGES,
  MAX_TOPICS,
  OBSTACLES,
  QUESTION_COUNT,
  READINESS,
  TOPICS,
  TREATMENT,
  TRIED,
  emptyContext,
  emptyJourney,
  parseResult,
  type Answers,
  type Context,
  type Journey,
  type MapResult,
} from "./scoring.ts";

export type Screen = "welcome" | "about" | "flow" | "journey" | "checkin" | "result" | "paths";
export const SCREENS: Screen[] = ["welcome", "about", "flow", "journey", "checkin", "result", "paths"];

/** "about": intro + C0–C8 = 0…9. "flow": 6 dividers + 24 statements = 0…29. "journey": divider + J1–J5 = 0…5. */
export const ABOUT_LENGTH = 10;
export const FLOW_LENGTH = 30;
export const JOURNEY_LENGTH = 6;
export const SCREEN_LENGTH: Record<Screen, number> = {
  welcome: 1,
  about: ABOUT_LENGTH,
  flow: FLOW_LENGTH,
  journey: JOURNEY_LENGTH,
  checkin: 1,
  result: 1,
  paths: 1,
};

export type SavedState = {
  v: 3;
  screen: Screen;
  pos: number;
  /** Kept only until the result exists, then cleared (spec §12: the six scores are enough). */
  answers: Answers;
  context: Context; // C1–C8, coded
  journey: Journey; // J1, J2, J4, coded
  /**
   * Her first name (C0) and her own words (J3, J5). Written to this device so the
   * conclusion can use them and a dropped connection does not lose them — never part of
   * the result object, and in Phase 1 never sent anywhere (spec §4, §13).
   */
  personal: Personal;
  /** The last finished Map. Kept while a re-take is in progress, replaced when it finishes. */
  result: MapResult | null;
  /** The wheel animates once, on the first render of a result. */
  animated: boolean;
};

export const STATE_KEY = "eq.v3";
const OLD_KEYS = ["eq.v1", "eq.v2"];
export const LOCALE_KEY = "eq.locale";

export function emptyState(): SavedState {
  return {
    v: 3,
    screen: "welcome",
    pos: 0,
    answers: Array(QUESTION_COUNT).fill(null),
    context: emptyContext(),
    journey: emptyJourney(),
    personal: emptyPersonal(),
    result: null,
    animated: false,
  };
}

const isLevel = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;
const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | null =>
  list.includes(v as string) ? (v as T[number]) : null;
const picks = <T extends readonly string[]>(list: T, v: unknown, max = 99): T[number][] =>
  Array.isArray(v) ? ([...new Set(v.filter((x) => list.includes(x)))] as T[number][]).slice(0, max) : [];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function validAnswers(a: unknown): a is Answers {
  return Array.isArray(a) && a.length === QUESTION_COUNT && a.every((x) => x === null || isLevel(x));
}

function parseContext(c: unknown): Context {
  const base = emptyContext();
  if (!c || typeof c !== "object") return base;
  const r = c as Record<string, unknown>;
  return {
    age: pick(AGE_BANDS, r.age),
    stage: pick(LIFE_STAGES, r.stage),
    caring: pick(CARING, r.caring),
    support: isLevel(r.support) ? (r.support as Context["support"]) : null,
    flex: isLevel(r.flex) || r.flex === "na" ? (r.flex as Context["flex"]) : null,
    treatment: pick(TREATMENT, r.treatment),
    topics: picks(TOPICS, r.topics, MAX_TOPICS),
    duration: pick(DURATIONS, r.duration),
  };
}

function parseJourney(j: unknown): Journey {
  if (!j || typeof j !== "object") return emptyJourney();
  const r = j as Record<string, unknown>;
  return { tried: picks(TRIED, r.tried), obstacles: picks(OBSTACLES, r.obstacles), readiness: pick(READINESS, r.readiness) };
}

function parsePersonal(p: unknown): Personal {
  if (!p || typeof p !== "object") return emptyPersonal();
  const r = p as Record<string, unknown>;
  return {
    name: text(r.name, 60),
    vision: text(r.vision, 2000),
    question: text(r.question, 2000),
    shareConsent: r.shareConsent === true,
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
  if (!s || typeof s !== "object" || s.v !== 3) return { state: base, resultLost: false };
  const result = parseResult(s.result);
  const resultLost = s.result != null && result === null;
  let screen = SCREENS.includes(s.screen as Screen) ? (s.screen as Screen) : "welcome";
  if ((screen === "result" || screen === "paths") && !result) screen = "welcome";
  const max = SCREEN_LENGTH[screen];
  const pos = Number.isInteger(s.pos) && (s.pos as number) >= 0 && (s.pos as number) < max ? (s.pos as number) : 0;
  return {
    state: {
      ...base,
      screen,
      pos,
      answers: validAnswers(s.answers) ? s.answers : base.answers,
      context: parseContext(s.context),
      journey: parseJourney(s.journey),
      personal: parsePersonal(s.personal),
      result,
      animated: s.animated === true,
    },
    resultLost,
  };
}

export function loadState(): { state: SavedState; resultLost: boolean } {
  try {
    for (const k of OLD_KEYS) window.localStorage.removeItem(k); // earlier versions of the Map
    return parseState(window.localStorage.getItem(STATE_KEY));
  } catch {
    return { state: emptyState(), resultLost: false };
  }
}

/** Returns false when the browser refuses to store (private mode, full, blocked). */
export function saveState(state: SavedState): boolean {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
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

/** "Delete my Map from this browser": the Map, her words and the remembered language. */
export function clearEverything(): void {
  try {
    for (const k of [STATE_KEY, LOCALE_KEY, ...OLD_KEYS]) window.localStorage.removeItem(k);
  } catch {
    /* nothing stored */
  }
}
