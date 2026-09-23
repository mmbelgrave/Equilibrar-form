import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResult, type Answer } from "../src/lib/scoring.ts";
import { emptyState, parseState } from "../src/lib/storage.ts";

const result = buildResult(Array(24).fill(2) as Answer[], {
  id: "x1",
  locale: "en",
  now: new Date("2026-09-22T10:00:00Z"),
  flagged: true,
  context: { stage: "building", caring: "children", support: 0, flex: 1, treatment: "yes" },
});

test("the saved state has no field for which check-in box was ticked (review finding 1)", () => {
  const saved = JSON.stringify({ ...emptyState(), screen: "result", result });
  assert.ok(!/mood/i.test(saved), saved);
  // Only the one boolean from the check-in exists anywhere in what is saved.
  assert.deepEqual(saved.match(/"flagged"/g), ['"flagged"']);
});

test("an old or foreign 'moodFlag' in storage is dropped on load", () => {
  const { state } = parseState(JSON.stringify({ ...emptyState(), moodFlag: true }));
  assert.ok(!("moodFlag" in state));
});

test("a damaged saved result → welcome screen + 'not found' (review finding 3)", () => {
  const { state, resultLost } = parseState(JSON.stringify({ v: 2, screen: "result", result: {} }));
  assert.equal(state.screen, "welcome");
  assert.equal(state.result, null);
  assert.equal(resultLost, true);
});

test("a good saved result comes back unchanged", () => {
  const { state, resultLost } = parseState(JSON.stringify({ ...emptyState(), screen: "result", result }));
  assert.equal(state.screen, "result");
  assert.deepEqual(state.result, result);
  assert.equal(resultLost, false);
});

test("invalid JSON, wrong version and nonsense fields fall back safely", () => {
  assert.deepEqual(parseState("{not json").state, emptyState());
  assert.deepEqual(parseState(JSON.stringify({ v: 1, screen: "flow", pos: 3 })).state, emptyState());
  const { state } = parseState(
    JSON.stringify({ v: 2, screen: "about", pos: 99, answers: [9], context: { stage: "x", support: 7 }, note: { text: 5 } }),
  );
  assert.equal(state.pos, 0);
  assert.equal(state.answers.length, 24);
  assert.deepEqual(state.context, emptyState().context);
  assert.equal(state.note.text, "");
});

test("the result object never contains her own words (C6)", () => {
  const withNote = { ...emptyState(), note: { text: "my own words", consent: true }, result };
  assert.ok(!JSON.stringify(withNote.result).includes("my own words"));
});

test("C6: her words reach the device only after she ticks the consent box (review 2 finding 1)", async () => {
  const { saveState } = await import("../src/lib/storage.ts");
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: { setItem: (k: string, v: string) => store.set(k, v), getItem: (k: string) => store.get(k) ?? null },
  };
  saveState({ ...emptyState(), note: { text: "PRIVATE-WORDS", consent: false } });
  assert.ok(!store.get("eq.v2")!.includes("PRIVATE-WORDS"));
  saveState({ ...emptyState(), note: { text: "PRIVATE-WORDS", consent: true } });
  assert.ok(store.get("eq.v2")!.includes("PRIVATE-WORDS"));
  delete (globalThis as { window?: unknown }).window;
});
