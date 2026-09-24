import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PILLARS,
  allStrong,
  bandOf,
  buildResult,
  emptyContext,
  emptyJourney,
  focusPillars,
  parseResult,
  recommendPath,
  scorePillars,
  sortedByScore,
  type Answer,
  type Context,
  type Journey,
} from "../src/lib/scoring.ts";

/** Four answers per pillar, in method order. */
const answersOf = (...sets: Answer[][]): Answer[] => sets.flat();

const CONTEXT: Context = {
  age: "40-49",
  stage: "perimenopause",
  caring: "parent",
  support: 1,
  flex: "na",
  treatment: "no",
  topics: ["energy", "gut"],
  duration: "1-3y",
};
const JOURNEY: Journey = { tried: ["diets", "gym"], obstacles: ["time"], readiness: "ready" };

const example = () =>
  buildResult(answersOf([1, 1, 1, 1], [2, 2, 2, 2], [2, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 2], [1, 1, 1, 0]), {
    id: "8f3c",
    locale: "pt",
    now: new Date("2026-09-24T14:02:11Z"),
    flagged: false,
    context: { ...CONTEXT },
    journey: { ...JOURNEY },
  });

test("hand-calculated example matches the formula (sum × 6.25, rounded)", () => {
  // Space 4 → 25 · Routine 8 → 50 · Sleep 5 → 31.25 → 31 · Calm 7 → 43.75 → 44
  // Food 11 → 68.75 → 69 · Strength 3 → 18.75 → 19
  const a = answersOf([1, 1, 1, 1], [2, 2, 2, 2], [2, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 2], [1, 1, 1, 0]);
  assert.deepEqual(scorePillars(a), { space: 25, routine: 50, sleep: 31, calm: 44, food: 69, strength: 19 });
});

test("halves round up: 2 → 13, 6 → 38, 10 → 63, 14 → 88", () => {
  const a = answersOf([2, 0, 0, 0], [2, 2, 2, 0], [4, 4, 2, 0], [4, 4, 4, 2], [0, 0, 0, 0], [4, 4, 4, 4]);
  assert.deepEqual(scorePillars(a), { space: 13, routine: 38, sleep: 63, calm: 88, food: 0, strength: 100 });
});

test("range: all 0 → 0, all 4 → 100", () => {
  assert.ok(Object.values(scorePillars(Array(24).fill(0))).every((s) => s === 0));
  assert.ok(Object.values(scorePillars(Array(24).fill(4))).every((s) => s === 100));
});

/* ------------------------------------------------- the two focus pillars (spec v3 §5) */

test("the two lowest pillars are the focus, lowest first", () => {
  const s = { space: 50, routine: 19, sleep: 50, calm: 25, food: 100, strength: 75 };
  assert.deepEqual(focusPillars(s), ["routine", "calm"]);
});

test("a tie goes to the earlier step — Space and Strength both lowest → Space first", () => {
  const a = answersOf([1, 1, 0, 0], [3, 3, 3, 3], [3, 3, 3, 3], [3, 3, 3, 3], [3, 3, 3, 3], [0, 0, 1, 1]);
  const s = scorePillars(a);
  assert.equal(s.space, s.strength);
  assert.deepEqual(focusPillars(s), ["space", "strength"]);
});

test("tie-break follows method order for every pair", () => {
  for (let i = 0; i < PILLARS.length; i++) {
    for (let j = i + 1; j < PILLARS.length; j++) {
      const s = { space: 90, routine: 90, sleep: 90, calm: 90, food: 90, strength: 90 };
      s[PILLARS[i]] = 10;
      s[PILLARS[j]] = 10;
      assert.deepEqual(focusPillars(s), [PILLARS[i], PILLARS[j]], `${PILLARS[i]} vs ${PILLARS[j]}`);
    }
  }
});

test("all equal → Space and Routine (the first two steps)", () => {
  assert.deepEqual(focusPillars(scorePillars(Array(24).fill(2))), ["space", "routine"]);
});

test("bands: 0–30 low, 31–55 building, 56–80 steady, 81–100 strong", () => {
  assert.deepEqual([0, 30, 31, 55, 56, 80, 81, 100].map(bandOf), [
    "low", "low", "building", "building", "steady", "steady", "strong", "strong",
  ]);
});

test("allStrong is true only when every pillar is 81 or more", () => {
  assert.equal(allStrong(scorePillars(Array(24).fill(4))), true);
  assert.equal(allStrong({ space: 81, routine: 81, sleep: 81, calm: 81, food: 81, strength: 80 }), false);
});

test("sorted list is lowest first, ties in method order", () => {
  const s = { space: 50, routine: 19, sleep: 50, calm: 19, food: 100, strength: 0 };
  assert.deepEqual(sortedByScore(s), ["strength", "routine", "calm", "space", "sleep", "food"]);
});

/* -------------------------------------------- the path recommendation (spec v3 §3) */

const j = (over: Partial<Journey>): Journey => ({ ...emptyJourney(), readiness: "almost", ...over });
const c = (over: Partial<Context>): Context => ({ ...emptyContext(), duration: "lt6m", ...over });

test("rule 1 — 'not yet, I'd like to learn first' → the Community", () => {
  assert.equal(recommendPath(j({ readiness: "learn", tried: ["diets", "gym"] }), c({ duration: "gt3y" })), "community");
});

test("rule 2 — ready now and carrying it a long time → the Mentorship", () => {
  assert.equal(recommendPath(j({ readiness: "ready" }), c({ duration: "1-3y" })), "mentorship");
  assert.equal(recommendPath(j({ readiness: "ready" }), c({ duration: "gt3y" })), "mentorship");
});

test("rule 2 — ready now and two or more things tried → the Mentorship", () => {
  assert.equal(recommendPath(j({ readiness: "ready", tried: ["diets", "apps"] }), c({})), "mentorship");
  // "nothing yet" does not count as something tried
  assert.equal(recommendPath(j({ readiness: "ready", tried: ["nothing"] }), c({})), "consultoria");
});

test("rule 3 — ready or almost ready otherwise → the Consultoria", () => {
  assert.equal(recommendPath(j({ readiness: "ready", tried: ["diets"] }), c({ duration: "6-12m" })), "consultoria");
  assert.equal(recommendPath(j({ readiness: "almost", tried: ["diets", "gym"] }), c({ duration: "gt3y" })), "consultoria");
});

test("every pillar strong → the Community, whatever else she answered", () => {
  const strong = scorePillars(Array(24).fill(4));
  assert.equal(recommendPath(j({ readiness: "ready" }), c({ duration: "gt3y" }), strong), "community");
});

/* ---------------------------------------------------------- the stored result (§5) */

test("result object: spec v3 fields, two focus pillars, no free text", () => {
  const r = example();
  assert.deepEqual(Object.keys(r).sort(), [
    "age_band", "caring_for", "chosen_path", "completed_at", "contact_id", "duration", "flagged", "focus_pillar",
    "focus_topics", "in_treatment", "life_stage", "locale", "obstacles", "readiness", "recommended_path",
    "score_calm", "score_food", "score_routine", "score_sleep", "score_space", "score_strength", "second_pillar",
    "submission_id", "support_home", "tried", "work_flex",
  ]);
  assert.equal(r.focus_pillar, "strength");
  assert.equal(r.second_pillar, "space");
  assert.equal(r.recommended_path, "mentorship"); // ready now + 1–3 years
  assert.equal(r.chosen_path, null);
  assert.deepEqual(r.focus_topics, ["energy", "gut"]);
});

test("parseResult accepts a real result and recomputes the focus pillars", () => {
  const r = example();
  assert.deepEqual(parseResult(JSON.parse(JSON.stringify(r))), r);
  const tampered = parseResult({ ...r, focus_pillar: "food", second_pillar: "food" });
  assert.equal(tampered?.focus_pillar, "strength");
  assert.equal(tampered?.second_pillar, "space");
});

test("parseResult rejects damaged results and results from version 1 or 2", () => {
  const r = example();
  assert.equal(parseResult({}), null);
  assert.equal(parseResult(null), null);
  assert.equal(parseResult({ ...r, score_food: "abc" }), null);
  assert.equal(parseResult({ ...r, score_food: 70 }), null); // not a score the formula can make
  assert.equal(parseResult({ ...r, completed_at: "yesterday" }), null);
  assert.equal(parseResult({ ...r, age_band: undefined }), null); // version 2 shape
  assert.equal(parseResult({ ...r, recommended_path: "coaching" }), null);
});

test("incomplete answers are refused", () => {
  assert.throws(() => scorePillars(Array(23).fill(2)));
});
