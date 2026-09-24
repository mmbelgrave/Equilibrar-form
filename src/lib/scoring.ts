// Pillars, steps, scoring and the path rules (spec v3 §4–§5).
// Self-contained so `node --test` can import it.

/** Method order. Also the tie-break order and the wheel order (clockwise from the top). */
export const PILLARS = ["space", "routine", "sleep", "calm", "food", "strength"] as const;
export type Pillar = (typeof PILLARS)[number];

export const STEPS = ["claim", "recover", "build"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_OF: Record<Pillar, Step> = {
  space: "claim",
  routine: "claim",
  sleep: "recover",
  calm: "recover",
  food: "build",
  strength: "build",
};

export const QUESTIONS_PER_PILLAR = 4;
export const QUESTION_COUNT = PILLARS.length * QUESTIONS_PER_PILLAR; // 24

/** One answer: 0 (Never) … 4 (Almost always), or null when not answered yet. */
export type Answer = 0 | 1 | 2 | 3 | 4;
export type Answers = (Answer | null)[];

export type Scores = Record<Pillar, number>;

export type Band = "low" | "building" | "steady" | "strong";

/** Question number 1–24 → its pillar. Questions 1–4 are Space, 21–24 Strength. */
export function pillarOfQuestion(questionIndex: number): Pillar {
  return PILLARS[Math.floor(questionIndex / QUESTIONS_PER_PILLAR)];
}

export function isComplete(answers: Answers): answers is Answer[] {
  return answers.length === QUESTION_COUNT && answers.every((a) => a !== null);
}

/** pillar score = (sum of its four answers) × 6.25, rounded. No weighting. */
export function scorePillars(answers: Answer[]): Scores {
  if (answers.length !== QUESTION_COUNT) throw new Error(`Expected ${QUESTION_COUNT} answers`);
  const scores = {} as Scores;
  PILLARS.forEach((pillar, p) => {
    const sum = answers
      .slice(p * QUESTIONS_PER_PILLAR, (p + 1) * QUESTIONS_PER_PILLAR)
      .reduce<number>((total, a) => total + a, 0);
    scores[pillar] = Math.round(sum * 6.25);
  });
  return scores;
}

/** Pillars sorted lowest first; ties in method order. */
export function sortedByScore(scores: Scores): Pillar[] {
  return [...PILLARS].sort((a, b) => scores[a] - scores[b] || PILLARS.indexOf(a) - PILLARS.indexOf(b));
}

/**
 * The two areas with the least support: Pillar A (lowest) and Pillar B (second lowest),
 * ties to the earlier step (spec v3 §5). Never called a "priority": the app suggests.
 */
export function focusPillars(scores: Scores): [Pillar, Pillar] {
  const [a, b] = sortedByScore(scores);
  return [a, b];
}

/** Bands change the words she reads, never a colour or a judgement. */
export function bandOf(score: number): Band {
  if (score <= 30) return "low";
  if (score <= 55) return "building";
  if (score <= 80) return "steady";
  return "strong";
}

/** Every pillar 81 or more: the conclusion changes tone and Community is highlighted (§5). */
export const allStrong = (scores: Scores): boolean => PILLARS.every((p) => scores[p] >= 81);

/* ---------------- Part A · about you, and Part C · her journey (spec v3 §4) ------------- */

export const AGE_BANDS = ["18-29", "30-39", "40-49", "50-59", "60+"] as const;
export const LIFE_STAGES = ["regular", "changing", "perimenopause", "menopause", "pregnant", "unsure"] as const;
export const CARING = ["none", "children", "parent", "both", "someone"] as const;
export const TREATMENT = ["yes", "no", "na"] as const;
export const TOPICS = ["gut", "cycle", "energy", "stress", "weight", "cravings", "skin", "thyroid", "general"] as const;
export const DURATIONS = ["lt6m", "6-12m", "1-3y", "gt3y"] as const;
export const TRIED = ["diets", "gym", "supplements", "apps", "doctor", "therapy", "nothing", "other"] as const;
export const OBSTACLES = ["time", "motivation", "strict", "fit", "results", "why", "cost"] as const;
export const READINESS = ["ready", "almost", "learn"] as const;
export const PATHS_ALL = ["community", "consultoria", "mentorship"] as const;

export type AgeBand = (typeof AGE_BANDS)[number];
export type LifeStage = (typeof LIFE_STAGES)[number];
export type Caring = (typeof CARING)[number];
export type Treatment = (typeof TREATMENT)[number];
export type Topic = (typeof TOPICS)[number];
export type Duration = (typeof DURATIONS)[number];
export type Tried = (typeof TRIED)[number];
export type Obstacle = (typeof OBSTACLES)[number];
export type Readiness = (typeof READINESS)[number];
export type Path = (typeof PATHS_ALL)[number];

/** 0 (none) … 4 (a lot). C5 may be "na" when she is not in paid work. */
export type Level = 0 | 1 | 2 | 3 | 4;

/** C1–C8. C0 (her first name) is personal, so it is never part of this. */
export type Context = {
  age: AgeBand | null; // C1
  stage: LifeStage | null; // C2
  caring: Caring | null; // C3
  support: Level | null; // C4
  flex: Level | "na" | null; // C5
  treatment: Treatment | null; // C6
  topics: Topic[]; // C7, at most two
  duration: Duration | null; // C8
};

/** J1–J4 as codes. J3 and J5 are her own words and live with the personal fields. */
export type Journey = {
  tried: Tried[]; // J1
  obstacles: Obstacle[]; // J2
  readiness: Readiness | null; // J4
};

export const MAX_TOPICS = 2;

export const emptyContext = (): Context => ({
  age: null,
  stage: null,
  caring: null,
  support: null,
  flex: null,
  treatment: null,
  topics: [],
  duration: null,
});

export const emptyJourney = (): Journey => ({ tried: [], obstacles: [], readiness: null });

/** Which "about you" questions must be answered (C0 is optional). */
export const CONTEXT_KEYS = ["age", "stage", "caring", "support", "flex", "treatment", "topics", "duration"] as const;

export function contextComplete(c: Context): boolean {
  return CONTEXT_KEYS.every((k) => (k === "topics" ? c.topics.length > 0 : c[k] !== null));
}

/** True when "nothing yet" is her whole answer to J1 — then J2 has nothing to ask about. */
export const triedNothing = (j: Journey): boolean => j.tried.length > 0 && j.tried.every((t) => t === "nothing");

/** J1 and J4 must be answered; J2 only if she has tried something; J3 and J5 are optional. */
export function journeyComplete(j: Journey): boolean {
  return j.tried.length > 0 && (triedNothing(j) || j.obstacles.length > 0) && j.readiness !== null;
}

/**
 * Which path card is highlighted (spec v3 §3, first rule that matches). It is a
 * suggestion, never a statement that one path is the right one. All pillars strong →
 * the Community, whatever else she answered.
 */
export function recommendPath(journey: Journey, context: Context, scores?: Scores): Path {
  if (scores && allStrong(scores)) return "community";
  if (journey.readiness === "learn") return "community";
  const longTime = context.duration === "1-3y" || context.duration === "gt3y";
  if (journey.readiness === "ready" && (longTime || journey.tried.filter((t) => t !== "nothing").length >= 2)) {
    return "mentorship";
  }
  return "consultoria";
}

/* -------------------------------- The stored result (§5) ------------------------------- */

/**
 * One row per submission. Coded answers only: her first name, her 90-day words (J3) and her
 * question for Rê (J5) are never in here — they stay on her own device in Phase 1.
 */
export type MapResult = {
  submission_id: string;
  locale: "pt" | "en";
  completed_at: string;
  age_band: AgeBand | null;
  life_stage: LifeStage | null;
  caring_for: Caring | null;
  support_home: Level | null;
  work_flex: Level | "na" | null;
  in_treatment: Treatment | null;
  focus_topics: Topic[];
  duration: Duration | null;
  score_space: number;
  score_routine: number;
  score_sleep: number;
  score_calm: number;
  score_food: number;
  score_strength: number;
  focus_pillar: Pillar;
  second_pillar: Pillar;
  tried: Tried[];
  obstacles: Obstacle[];
  readiness: Readiness | null;
  flagged: boolean;
  recommended_path: Path;
  /** Phase 2: which card she chose, and the contact record. */
  chosen_path: Path | null;
  contact_id: string | null;
};

export function buildResult(
  answers: Answer[],
  opts: { id: string; locale: "pt" | "en"; now: Date; flagged: boolean; context: Context; journey: Journey },
): MapResult {
  const s = scorePillars(answers);
  const [focus, second] = focusPillars(s);
  const { context: c, journey: j } = opts;
  return {
    submission_id: opts.id,
    locale: opts.locale,
    completed_at: opts.now.toISOString(),
    age_band: c.age,
    life_stage: c.stage,
    caring_for: c.caring,
    support_home: c.support,
    work_flex: c.flex,
    in_treatment: c.treatment,
    focus_topics: [...c.topics],
    duration: c.duration,
    score_space: s.space,
    score_routine: s.routine,
    score_sleep: s.sleep,
    score_calm: s.calm,
    score_food: s.food,
    score_strength: s.strength,
    focus_pillar: focus,
    second_pillar: second,
    tried: [...j.tried],
    obstacles: [...j.obstacles],
    readiness: j.readiness,
    flagged: opts.flagged,
    recommended_path: recommendPath(j, c, s),
    chosen_path: null,
    contact_id: null,
  };
}

export function scoresOf(result: MapResult): Scores {
  return {
    space: result.score_space,
    routine: result.score_routine,
    sleep: result.score_sleep,
    calm: result.score_calm,
    food: result.score_food,
    strength: result.score_strength,
  };
}

const isLevel = (v: unknown): v is Level => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;
const oneOf = <T extends readonly unknown[]>(list: T, v: unknown): v is T[number] => list.includes(v);
const codesOf = <T extends readonly string[]>(list: T, v: unknown): T[number][] =>
  Array.isArray(v) ? (v.filter((x) => list.includes(x)) as T[number][]) : [];
/** Only scores the formula can produce: multiples of 6.25, rounded. */
const VALID_SCORES = new Set(Array.from({ length: 17 }, (_, i) => Math.round(i * 6.25)));

/**
 * Checks a saved result field by field. Anything damaged or from an older version returns
 * null, so the app shows "result not found" instead of a broken screen. The focus pillars
 * are recomputed from the scores, never trusted.
 */
export function parseResult(raw: unknown): MapResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!PILLARS.every((p) => VALID_SCORES.has(r[`score_${p}`] as number))) return null;
  if (typeof r.submission_id !== "string" || !r.submission_id) return null;
  if (r.locale !== "pt" && r.locale !== "en") return null;
  if (typeof r.completed_at !== "string" || Number.isNaN(Date.parse(r.completed_at))) return null;
  if (typeof r.flagged !== "boolean") return null;
  if (!oneOf(AGE_BANDS, r.age_band) || !oneOf(LIFE_STAGES, r.life_stage) || !oneOf(CARING, r.caring_for)) return null;
  if (!oneOf(TREATMENT, r.in_treatment) || !oneOf(DURATIONS, r.duration) || !oneOf(READINESS, r.readiness)) return null;
  if (!isLevel(r.support_home) || !(isLevel(r.work_flex) || r.work_flex === "na")) return null;
  if (!oneOf(PATHS_ALL, r.recommended_path)) return null;
  const journey: Journey = {
    tried: codesOf(TRIED, r.tried),
    obstacles: codesOf(OBSTACLES, r.obstacles),
    readiness: r.readiness,
  };
  const scores = Object.fromEntries(PILLARS.map((p) => [p, r[`score_${p}`] as number])) as Scores;
  const [focus, second] = focusPillars(scores);
  return {
    submission_id: r.submission_id,
    locale: r.locale,
    completed_at: r.completed_at,
    age_band: r.age_band,
    life_stage: r.life_stage,
    caring_for: r.caring_for,
    support_home: r.support_home,
    work_flex: r.work_flex,
    in_treatment: r.in_treatment,
    focus_topics: codesOf(TOPICS, r.focus_topics).slice(0, MAX_TOPICS),
    duration: r.duration,
    score_space: scores.space,
    score_routine: scores.routine,
    score_sleep: scores.sleep,
    score_calm: scores.calm,
    score_food: scores.food,
    score_strength: scores.strength,
    focus_pillar: focus,
    second_pillar: second,
    tried: journey.tried,
    obstacles: journey.obstacles,
    readiness: r.readiness,
    flagged: r.flagged,
    // Recomputed, like the focus pillars: a Map saved before a rule change still shows
    // the highlight today's rules would give.
    recommended_path: recommendPath(journey, {
      ...emptyContext(),
      duration: r.duration,
      topics: codesOf(TOPICS, r.focus_topics).slice(0, MAX_TOPICS),
    }, scores),
    chosen_path: oneOf(PATHS_ALL, r.chosen_path) ? r.chosen_path : null,
    contact_id: typeof r.contact_id === "string" ? r.contact_id : null,
  };
}
