import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PILLARS,
  bandOf,
  buildResult,
  emptyContext,
  parseResult,
  priorityPillar,
  scorePillars,
  sortedByScore,
  type Answer,
} from "../src/lib/scoring.ts";

/** Four answers per pillar, in method order. */
const answersOf = (...sets: Answer[][]): Answer[] => sets.flat();

test("hand-calculated example matches the formula (sum × 6.25, rounded)", () => {
  // Space 1+1+1+1=4 → 25 · Routine 2+2+2+2=8 → 50 · Sleep 2+1+1+1=5 → 31.25 → 31
  // Calm 2+2+2+1=7 → 43.75 → 44 · Food 3+3+3+2=11 → 68.75 → 69 · Strength 1+1+1+0=3 → 18.75 → 19
  const a = answersOf([1, 1, 1, 1], [2, 2, 2, 2], [2, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 2], [1, 1, 1, 0]);
  assert.deepEqual(scorePillars(a), { space: 25, routine: 50, sleep: 31, calm: 44, food: 69, strength: 19 });
  assert.equal(priorityPillar(scorePillars(a)), "strength");
});

test("halves round up: 2 → 12.5 → 13, 6 → 37.5 → 38, 10 → 62.5 → 63, 14 → 87.5 → 88", () => {
  const a = answersOf([2, 0, 0, 0], [2, 2, 2, 0], [4, 4, 2, 0], [4, 4, 4, 2], [0, 0, 0, 0], [4, 4, 4, 4]);
  assert.deepEqual(scorePillars(a), { space: 13, routine: 38, sleep: 63, calm: 88, food: 0, strength: 100 });
});

test("range: all 0 → 0, all 4 → 100", () => {
  assert.ok(Object.values(scorePillars(Array(24).fill(0))).every((s) => s === 0));
  assert.ok(Object.values(scorePillars(Array(24).fill(4))).every((s) => s === 100));
});

test("tie-break: Space and Strength both lowest → Space", () => {
  const a = answersOf([1, 1, 0, 0], [3, 3, 3, 3], [3, 3, 3, 3], [3, 3, 3, 3], [3, 3, 3, 3], [0, 0, 1, 1]);
  const s = scorePillars(a);
  assert.equal(s.space, s.strength);
  assert.equal(priorityPillar(s), "space");
});

test("tie-break follows method order for every pair", () => {
  for (let i = 0; i < PILLARS.length; i++) {
    for (let j = i + 1; j < PILLARS.length; j++) {
      const s = { space: 90, routine: 90, sleep: 90, calm: 90, food: 90, strength: 90 };
      s[PILLARS[i]] = 10;
      s[PILLARS[j]] = 10;
      assert.equal(priorityPillar(s), PILLARS[i], `${PILLARS[i]} vs ${PILLARS[j]}`);
    }
  }
});

test("all equal → Space (first step wins)", () => {
  assert.equal(priorityPillar(scorePillars(Array(24).fill(2))), "space");
});

test("bands: 0–30 low, 31–55 building, 56–80 steady, 81–100 strong", () => {
  assert.deepEqual([0, 30, 31, 55, 56, 80, 81, 100].map(bandOf), [
    "low", "low", "building", "building", "steady", "steady", "strong", "strong",
  ]);
});

test("sorted list puts the priority first, ties in method order", () => {
  const s = { space: 50, routine: 19, sleep: 50, calm: 19, food: 100, strength: 0 };
  assert.deepEqual(sortedByScore(s), ["strength", "routine", "calm", "space", "sleep", "food"]);
});

const CTX = { stage: "mid", caring: "parent", support: 1, flex: "na", treatment: "no" } as const;
const example = () =>
  buildResult(answersOf([1, 1, 1, 1], [2, 2, 2, 2], [2, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 2], [1, 1, 1, 0]), {
    id: "8f3c", locale: "pt", now: new Date("2026-09-22T14:02:11Z"), flagged: false, context: { ...CTX },
  });

test("result object: spec v2 fields, suggested_focus (not priority), C1–C5 coded, no C6; Strength → Build", () => {
  const r = example();
  assert.deepEqual(Object.keys(r).sort(), [
    "completed_at", "context_caring", "context_flex", "context_stage", "context_support", "context_treatment",
    "email", "flagged", "locale",
    "score_calm", "score_food", "score_routine", "score_sleep", "score_space", "score_strength",
    "submission_id", "suggested_focus", "suggested_focus_step",
  ]);
  assert.equal(r.suggested_focus, "strength");
  assert.equal(r.suggested_focus_step, "build");
  assert.equal(r.completed_at, "2026-09-22T14:02:11.000Z");
  assert.equal(r.email, null);
});

test("incomplete answers are refused", () => {
  assert.throws(() => scorePillars(Array(23).fill(2)));
});

test("parseResult accepts a real result and recomputes the focus", () => {
  const r = example();
  assert.deepEqual(parseResult(JSON.parse(JSON.stringify(r))), r);
  assert.equal(parseResult({ ...r, suggested_focus: "space" })?.suggested_focus, "strength");
});

test("parseResult rejects damaged or old results (review finding 3)", () => {
  const r = example();
  assert.equal(parseResult({}), null);
  assert.equal(parseResult(null), null);
  assert.equal(parseResult({ ...r, score_food: "abc" }), null);
  assert.equal(parseResult({ ...r, score_food: 140 }), null);
  assert.equal(parseResult({ ...r, score_food: 70 }), null); // not a score the formula can make
  assert.equal(parseResult({ ...r, completed_at: "yesterday" }), null);
  assert.equal(parseResult({ ...r, context_stage: undefined }), null); // v1 shape, no context
  assert.equal(parseResult({ ...r, context_flex: 7 }), null);
});

test("emptyContext has all five coded context answers unset", () => {
  assert.deepEqual(emptyContext(), { stage: null, caring: null, support: null, flex: null, treatment: null });
});
