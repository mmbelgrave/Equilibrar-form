// What is sent to Rê's database, and what Rê sees (spec v4 §12, §13). These are the pure
// parts: the payload built while she answers, the status of a Map, the overview and the CSV.
import assert from "node:assert/strict";
import { test } from "node:test";
import { overview, pillarsAnswered, progressPayload, statusOf, toCsv, type AdminMap } from "../src/lib/db.ts";
import { emptyContext, emptyJourney, type Context, type Journey } from "../src/lib/scoring.ts";

const CONTEXT: Context = {
  age: "40-49",
  stage: "perimenopause",
  caring: "parent",
  support: 1,
  flex: "na",
  treatment: "yes",
  topics: ["energy", "gut"],
  duration: "1-3y",
};
const JOURNEY: Journey = { tried: ["diets"], obstacles: ["time"], readiness: "ready" };

test("nothing identifying is ever in what is saved while she answers", () => {
  const payload = progressPayload("pt", "pillars", CONTEXT, JOURNEY, { space: 25, routine: 50 });
  const sent = JSON.stringify(payload);
  for (const field of ["name", "first_name", "vision", "question", "email", "whatsapp", "flagged", "answers"]) {
    assert.ok(!sent.includes(field), `"${field}" must not be sent while she is answering`);
  }
  // Coded answers and finished pillar scores only.
  assert.equal(payload.age_band, "40-49");
  assert.deepEqual(payload.focus_topics, ["energy", "gut"]);
  assert.equal(payload.score_space, 25);
  assert.equal(payload.score_sleep, null); // that pillar is not finished yet
});

test("an empty start sends nothing but the language and the step", () => {
  const payload = progressPayload("en", "about", emptyContext(), emptyJourney(), {});
  assert.equal(payload.locale, "en");
  assert.equal(payload.step, "about");
  for (const [key, value] of Object.entries(payload)) {
    if (["locale", "step", "updated_at"].includes(key)) continue;
    assert.ok(value === null || (Array.isArray(value) && value.length === 0), `${key} should be empty, got ${value}`);
  }
});

/* --------------------------------------------------------------- what Rê sees ---- */

const now = new Date("2026-09-25T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const map = (over: Partial<AdminMap> = {}): AdminMap =>
  ({
    id: "m1",
    locale: "pt",
    step: "pillars",
    created_at: ago(1),
    updated_at: ago(1),
    finished_at: null,
    shared_at: null,
    status: "open",
    note: null,
    focus_topics: [],
    tried: [],
    obstacles: [],
    contact: null,
    ...over,
  }) as AdminMap;

test("a Map is in progress, then stopped after 7 quiet days", () => {
  assert.equal(statusOf(map({ updated_at: ago(2) }), now), "in_progress");
  assert.equal(statusOf(map({ updated_at: ago(7.5) }), now), "stopped");
});

test("finishing and sharing outrank how long ago she was here", () => {
  assert.equal(statusOf(map({ updated_at: ago(30), finished_at: ago(30) }), now), "finished");
  assert.equal(statusOf(map({ updated_at: ago(30), finished_at: ago(30), shared_at: ago(29) }), now), "shared");
});

test("how far an unfinished Map got", () => {
  assert.equal(pillarsAnswered(map()), 0);
  assert.equal(pillarsAnswered(map({ score_space: 25, score_routine: 50, score_sleep: 0 })), 3);
});

test("the overview counts what Rê asked for", () => {
  const maps = [
    map({ created_at: ago(1), finished_at: ago(1), shared_at: ago(1), focus_pillar: "space", chosen_path: "mentorship", recommended_path: "mentorship" }),
    map({ created_at: ago(3), finished_at: ago(3), focus_pillar: "space" }),
    map({ created_at: ago(5), focus_pillar: null, step: "journey" }),
    map({ created_at: ago(20), finished_at: ago(20), focus_pillar: "food", locale: "en" }),
  ];
  const sums = overview(maps, now);
  assert.equal(sums.week.started, 3);
  assert.equal(sums.week.finished, 2);
  assert.equal(sums.week.shared, 1);
  assert.equal(sums.month.started, 4);
  assert.equal(sums.byLocale.en, 1);
  assert.equal(sums.completionRate, 75);
  assert.equal(sums.shareRate, 33); // one share out of three finished
  assert.deepEqual(sums.lowest, { space: 2, food: 1 });
  assert.equal(sums.stoppedAt.journey, 1);
  assert.equal(sums.followedRecommendation, 100);
});

test("the CSV has a header, one line per Map, and survives commas and quotes", () => {
  const csv = toCsv(
    [
      map({
        finished_at: ago(1),
        shared_at: ago(1),
        focus_pillar: "space",
        note: 'She said "later", maybe in June',
        contact: { first_name: "Ana", email: "ana@example.com", whatsapp: "+55 11 9", instagram: null, vision: null, question_for_re: null, consent_email: true },
      }),
    ],
    now,
  );
  const [head, row] = csv.split("\n");
  assert.ok(head.startsWith("date,status,language"));
  assert.ok(row.includes("shared"));
  assert.ok(row.includes("ana@example.com"));
  assert.ok(row.includes('"She said ""later"", maybe in June"'));
  assert.equal(csv.split("\n").length, 2);
});

test("the CSV never carries the check-in or the 24 answers", () => {
  const csv = toCsv([map({ finished_at: ago(1) })], now);
  for (const word of ["flagged", "checkin", "answers"]) assert.ok(!csv.includes(word), word);
});
