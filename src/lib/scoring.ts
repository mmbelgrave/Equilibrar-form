// Pillars, steps and scoring (spec §4–§5). Self-contained so `node --test` can import it.

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

/** Lowest score wins; a tie goes to the earlier step (method order). */
export function priorityPillar(scores: Scores): Pillar {
  let best: Pillar = PILLARS[0];
  for (const pillar of PILLARS) {
    if (scores[pillar] < scores[best]) best = pillar; // strict: earlier pillar keeps a tie
  }
  return best;
}

/** Bands change the words she reads, never a colour or a judgement. */
export function bandOf(score: number): Band {
  if (score <= 30) return "low";
  if (score <= 55) return "building";
  if (score <= 80) return "steady";
  return "strong";
}

/** Pillars sorted lowest first; ties in method order, so the priority is always first. */
export function sortedByScore(scores: Scores): Pillar[] {
  return [...PILLARS].sort((a, b) => scores[a] - scores[b] || PILLARS.indexOf(a) - PILLARS.indexOf(b));
}

/* ---------- Part A · context (spec v2 §4). Not scored; changes wording only. ---------- */

export const STAGES = ["early", "building", "mid", "later", "na"] as const;
export const CARING = ["none", "children", "parent", "unwell", "several", "na"] as const;
export const TREATMENT = ["yes", "no", "na"] as const;
/** C3 support at home and C4 flexible working week: 0 (none) … 4 (a lot). C4 may be "na" (no paid work). */
export type Level = 0 | 1 | 2 | 3 | 4;

export type Context = {
  stage: (typeof STAGES)[number] | null; // C1
  caring: (typeof CARING)[number] | null; // C2
  support: Level | null; // C3
  flex: Level | "na" | null; // C4
  treatment: (typeof TREATMENT)[number] | null; // C5
};

export const emptyContext = (): Context => ({ stage: null, caring: null, support: null, flex: null, treatment: null });

export const CONTEXT_KEYS = ["stage", "caring", "support", "flex", "treatment"] as const;

export function contextComplete(c: Context): boolean {
  return CONTEXT_KEYS.every((k) => c[k] !== null);
}

/**
 * The result object (spec §5, v2). `suggested_focus`, not "priority": the Map suggests,
 * she decides where she begins. C1–C5 are stored as coded values; C6 (her own words)
 * is never part of this object. `email` stays null until Phase 2.
 */
export type MapResult = {
  submission_id: string;
  locale: "pt" | "en";
  completed_at: string;
  score_space: number;
  score_routine: number;
  score_sleep: number;
  score_calm: number;
  score_food: number;
  score_strength: number;
  suggested_focus: Pillar;
  suggested_focus_step: Step;
  flagged: boolean;
  context_stage: Context["stage"];
  context_caring: Context["caring"];
  context_support: Context["support"];
  context_flex: Context["flex"];
  context_treatment: Context["treatment"];
  email: string | null;
};

export function buildResult(
  answers: Answer[],
  opts: { id: string; locale: "pt" | "en"; now: Date; flagged: boolean; context: Context },
): MapResult {
  const s = scorePillars(answers);
  const focus = priorityPillar(s);
  return {
    submission_id: opts.id,
    locale: opts.locale,
    completed_at: opts.now.toISOString(),
    score_space: s.space,
    score_routine: s.routine,
    score_sleep: s.sleep,
    score_calm: s.calm,
    score_food: s.food,
    score_strength: s.strength,
    suggested_focus: focus,
    suggested_focus_step: STEP_OF[focus],
    flagged: opts.flagged,
    context_stage: opts.context.stage,
    context_caring: opts.context.caring,
    context_support: opts.context.support,
    context_flex: opts.context.flex,
    context_treatment: opts.context.treatment,
    email: null,
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
/** Only scores the formula can produce: multiples of 6.25, rounded. */
const VALID_SCORES = new Set(Array.from({ length: 17 }, (_, i) => Math.round(i * 6.25)));

/**
 * Checks a saved result field by field. Anything damaged or from an older version
 * returns null, so the app shows "result not found" instead of a broken screen.
 * The focus is recomputed from the scores, never trusted.
 */
export function parseResult(raw: unknown): MapResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const scoreKeys = PILLARS.map((p) => `score_${p}`);
  if (!scoreKeys.every((k) => VALID_SCORES.has(r[k] as number))) return null;
  if (typeof r.submission_id !== "string" || !r.submission_id) return null;
  if (r.locale !== "pt" && r.locale !== "en") return null;
  if (typeof r.completed_at !== "string" || Number.isNaN(Date.parse(r.completed_at))) return null;
  if (typeof r.flagged !== "boolean") return null;
  if (!oneOf(STAGES, r.context_stage) || !oneOf(CARING, r.context_caring) || !oneOf(TREATMENT, r.context_treatment)) return null;
  if (!isLevel(r.context_support) || !(isLevel(r.context_flex) || r.context_flex === "na")) return null;
  const scores = Object.fromEntries(PILLARS.map((p) => [p, r[`score_${p}`] as number])) as Scores;
  const focus = priorityPillar(scores);
  return {
    submission_id: r.submission_id,
    locale: r.locale,
    completed_at: r.completed_at,
    score_space: scores.space,
    score_routine: scores.routine,
    score_sleep: scores.sleep,
    score_calm: scores.calm,
    score_food: scores.food,
    score_strength: scores.strength,
    suggested_focus: focus,
    suggested_focus_step: STEP_OF[focus],
    flagged: r.flagged,
    context_stage: r.context_stage,
    context_caring: r.context_caring,
    context_support: r.context_support,
    context_flex: r.context_flex,
    context_treatment: r.context_treatment,
    email: typeof r.email === "string" ? r.email : null,
  };
}
