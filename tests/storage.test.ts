import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyPersonal } from "../src/lib/conclusion.ts";
import { buildResult, type Answer, type Context, type Journey } from "../src/lib/scoring.ts";
import { emptyState, parseState } from "../src/lib/storage.ts";

const CONTEXT: Context = {
  age: "30-39",
  stage: "regular",
  caring: "children",
  support: 0,
  flex: 1,
  treatment: "yes",
  topics: ["gut", "cravings"],
  duration: "6-12m",
};
const JOURNEY: Journey = { tried: ["diets"], obstacles: ["time", "cost"], readiness: "almost" };

const result = buildResult(Array(24).fill(2) as Answer[], {
  id: "x1",
  locale: "en",
  now: new Date("2026-09-24T10:00:00Z"),
  flagged: true,
  context: CONTEXT,
  journey: JOURNEY,
});

const PERSONAL = { name: "Ana", vision: "MY-90-DAY-WORDS", question: "MY-QUESTION", shareConsent: true };

test("what is saved holds no trace of which check-in box was ticked", () => {
  const saved = JSON.stringify({ ...emptyState(), screen: "result", result });
  assert.ok(!/mood/i.test(saved), saved);
  assert.deepEqual(saved.match(/"flagged"/g), ['"flagged"']);
});

test("her name and her own words are saved on the device but never in the result", () => {
  const state = { ...emptyState(), screen: "result" as const, result, personal: PERSONAL };
  const saved = JSON.stringify(state);
  assert.ok(saved.includes("MY-90-DAY-WORDS")); // on her own device, so the conclusion can use it
  assert.ok(!JSON.stringify(result).includes("MY-90-DAY-WORDS"));
  assert.ok(!JSON.stringify(result).includes("MY-QUESTION"));
  assert.ok(!JSON.stringify(result).includes("Ana"));
});

test("a good saved state comes back unchanged", () => {
  const state = { ...emptyState(), screen: "result" as const, result, personal: PERSONAL };
  const { state: back, resultLost } = parseState(JSON.stringify(state));
  assert.deepEqual(back.result, result);
  assert.deepEqual(back.personal, PERSONAL);
  assert.equal(resultLost, false);
});

test("a damaged saved result → welcome screen and 'not found'", () => {
  const { state, resultLost } = parseState(JSON.stringify({ v: 3, screen: "result", result: {} }));
  assert.equal(state.screen, "welcome");
  assert.equal(state.result, null);
  assert.equal(resultLost, true);
});

test("saved Maps from version 1 and 2 are ignored, not half-read", () => {
  assert.deepEqual(parseState(JSON.stringify({ v: 1, screen: "flow", pos: 3 })).state, emptyState());
  assert.deepEqual(parseState(JSON.stringify({ v: 2, screen: "flow", pos: 3 })).state, emptyState());
});

test("invalid JSON and nonsense fields fall back safely", () => {
  assert.deepEqual(parseState("{not json").state, emptyState());
  const { state } = parseState(
    JSON.stringify({
      v: 3,
      screen: "about",
      pos: 99,
      answers: [9],
      context: { age: "nope", support: 7, topics: ["gut", "cycle", "energy", "bogus"] },
      journey: { tried: ["diets", "bogus"], readiness: "someday" },
      personal: { name: 5, vision: "ok", shareConsent: "yes" },
    }),
  );
  assert.equal(state.pos, 0);
  assert.equal(state.answers.length, 24);
  assert.equal(state.context.age, null);
  assert.equal(state.context.support, null);
  assert.deepEqual(state.context.topics, ["gut", "cycle"]); // at most two, known codes only
  assert.deepEqual(state.journey.tried, ["diets"]);
  assert.equal(state.journey.readiness, null);
  assert.equal(state.personal.name, "");
  assert.equal(state.personal.shareConsent, false);
});

test("an empty personal record has nothing in it and no consent", () => {
  assert.deepEqual(emptyPersonal(), { name: "", vision: "", question: "", shareConsent: false });
});

test("the Map's id in Rê's database survives a refresh, and nothing else does", () => {
  // Without this she would get a new row every time she came back, and Rê's figures would
  // count one woman as many (review 5, finding 4).
  const id = "3f1a7c58-0b2e-4d6a-9c11-5e8d2f4b7a90";
  assert.equal(parseState(JSON.stringify({ v: 3, mapId: id })).state.mapId, id);
  assert.equal(parseState(JSON.stringify({ v: 3, mapId: "../../etc/passwd" })).state.mapId, null);
  assert.equal(parseState(JSON.stringify({ v: 3, mapId: 42 })).state.mapId, null);
  assert.equal(emptyState().mapId, null);
});
