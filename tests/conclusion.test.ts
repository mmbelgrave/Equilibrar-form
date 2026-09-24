import assert from "node:assert/strict";
import { test } from "node:test";
import { conclusionBlocks, emptyPersonal, type Personal } from "../src/lib/conclusion.ts";
import { buildResult, type Answer, type Context, type Journey } from "../src/lib/scoring.ts";

const CONTEXT: Context = {
  age: "40-49",
  stage: "perimenopause",
  caring: "parent",
  support: 1,
  flex: 2,
  treatment: "no",
  topics: ["energy"],
  duration: "1-3y",
};
const JOURNEY: Journey = { tried: ["diets", "gym"], obstacles: ["time"], readiness: "ready" };

/** Lowest Strength, second lowest Space (the spec's own example). */
const LOW = [1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 3, 3, 3, 2, 1, 1, 1, 0] as Answer[];

const make = (over: { answers?: Answer[]; context?: Partial<Context>; journey?: Partial<Journey>; flagged?: boolean } = {}) =>
  buildResult(over.answers ?? LOW, {
    id: "x",
    locale: "en",
    now: new Date("2026-09-24T10:00:00Z"),
    flagged: over.flagged ?? false,
    context: { ...CONTEXT, ...over.context },
    journey: { ...JOURNEY, ...over.journey },
  });

const person = (over: Partial<Personal> = {}): Personal => ({ ...emptyPersonal(), name: "Ana", vision: "More energy", ...over });
const ids = (...args: Parameters<typeof conclusionBlocks>) => conclusionBlocks(...args).map((b) => b.id);

test("the eight blocks come in the order the spec sets out", () => {
  assert.deepEqual(ids(make(), person()), [
    "map", "focus", "connection", "notYou", "howWeWork", "begin", "herWords", "thisWeek",
  ]);
});

test("block 1 uses her name when she gave one, and nothing when she did not", () => {
  const [first] = conclusionBlocks(make(), person());
  assert.deepEqual(first, { id: "map", name: "Ana" });
  const [anon] = conclusionBlocks(make(), person({ name: "  " }));
  assert.deepEqual(anon, { id: "map", name: "" });
});

test("block 2 names the two lowest pillars, lowest first", () => {
  const focus = conclusionBlocks(make(), person())[1];
  assert.deepEqual(focus, { id: "focus", a: "strength", b: "space", strong: false });
});

test("no 90-day words → block 7 is left out, never filled with a generic line", () => {
  assert.ok(!ids(make({ context: { duration: "lt6m" } }), person({ vision: "" })).includes("herWords"));
});

test("no 90-day words but carried for years → the 'you don't have to carry it alone' line stays", () => {
  const block = conclusionBlocks(make({ context: { duration: "gt3y" } }), person({ vision: "" })).find((b) => b.id === "herWords");
  assert.equal(block?.id === "herWords" && block.vision, "");
  assert.equal(block?.id === "herWords" && block.duration, "gt3y");
});

test("carried for a year or more → block 7 adds the duration line", () => {
  const long = conclusionBlocks(make({ context: { duration: "gt3y" } }), person()).find((b) => b.id === "herWords");
  assert.equal(long?.id === "herWords" && long.duration, "gt3y");
  const short = conclusionBlocks(make({ context: { duration: "lt6m" } }), person()).find((b) => b.id === "herWords");
  assert.equal(short?.id === "herWords" && short.duration, null);
});

test("nothing tried yet → block 4 becomes the 'right order' version", () => {
  const block = conclusionBlocks(make({ journey: { tried: ["nothing"] } }), person()).find((b) => b.id === "notYou");
  assert.equal(block?.id === "notYou" && block.nothingTried, true);
});

test("in treatment → block 6 carries the treatment line", () => {
  const block = conclusionBlocks(make({ context: { treatment: "yes" } }), person()).find((b) => b.id === "begin");
  assert.equal(block?.id === "begin" && block.inTreatment, true);
  const not = conclusionBlocks(make(), person()).find((b) => b.id === "begin");
  assert.equal(not?.id === "begin" && not.inTreatment, false);
});

test("focus in Space or Routine → block 6 says the focus is where the method starts", () => {
  // Lowest Space, second lowest Routine.
  const answers = [0, 0, 0, 0, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] as Answer[];
  const block = conclusionBlocks(make({ answers }), person()).find((b) => b.id === "begin");
  assert.equal(block?.id === "begin" && block.focusIsClaim, true);
});

test("every pillar strong → blocks 3 and 4 are left out and the all-strong line appears", () => {
  const strong = Array(24).fill(4) as Answer[];
  const list = ids(make({ answers: strong }), person());
  assert.ok(list.includes("allStrong"));
  assert.ok(!list.includes("connection"));
  assert.ok(!list.includes("notYou"));
});

test("all-strong: the good news comes before the two lowest areas, and they are marked strong", () => {
  const strong = Array(24).fill(4) as Answer[];
  const blocks = conclusionBlocks(make({ answers: strong }), person());
  assert.deepEqual(blocks.map((b) => b.id).slice(0, 3), ["map", "allStrong", "focus"]);
  const focus = blocks.find((b) => b.id === "focus");
  assert.equal(focus?.id === "focus" && focus.strong, true);
});

test("both health topics reach the conclusion, not just the first", () => {
  const block = conclusionBlocks(make({ context: { topics: ["energy", "gut"] } }), person()).find((b) => b.id === "connection");
  assert.deepEqual(block?.id === "connection" && block.topics, ["energy", "gut"]);
});

test("no topic chosen → the connection block is left out rather than half-written", () => {
  assert.ok(!ids(make({ context: { topics: [] } }), person()).includes("connection"));
});

test("her own words are used but never reach the stored result", () => {
  const result = make();
  const json = JSON.stringify(result);
  assert.ok(!json.includes("Ana"));
  assert.ok(!json.includes("More energy"));
});
