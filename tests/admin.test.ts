// Rê's own page: both languages, who is shown in the list, and when somebody came.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COPY, PILLAR_NAME, hasAnswered, whenWas } from "../src/lib/adminCopy.ts";
import { PILLARS } from "../src/lib/scoring.ts";

const LOCALES = ["pt", "en"] as const;

test("the page says the same things in both languages", () => {
  const keys = (o: object) => Object.keys(o).sort();
  assert.deepEqual(keys(COPY.pt), keys(COPY.en), "one language is missing a line the other has");
  for (const k of keys(COPY.pt)) {
    const pt = COPY.pt[k as keyof typeof COPY.pt];
    const en = COPY.en[k as keyof typeof COPY.en];
    assert.equal(typeof pt, typeof en, `${k} is a different kind of thing in each language`);
  }
});

test("nothing on the page is left empty, in either language", () => {
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(COPY[l])) {
      if (typeof v === "string") assert.ok(v.trim().length > 0, `${l}:${k} is blank`);
      if (typeof v === "object" && v !== null) {
        for (const [k2, v2] of Object.entries(v)) assert.ok(String(v2).trim().length > 0, `${l}:${k}.${k2} is blank`);
      }
    }
  }
});

test("every pillar has a name in both languages, and pillar 4 is Emotions", () => {
  for (const l of LOCALES) {
    for (const p of PILLARS) assert.ok(PILLAR_NAME[l][p], `${l}:${p}`);
  }
  assert.equal(PILLAR_NAME.pt.calm, "Emoções");
  assert.equal(PILLAR_NAME.en.calm, "Emotions");
});

/* ------------------------------------------------- who belongs in the list ---------- */

const row = (over: Record<string, unknown> = {}) => ({
  age_band: null,
  life_stage: null,
  caring_for: null,
  duration: null,
  focus_topics: [],
  tried: [],
  score_space: null,
  ...over,
}) as Parameters<typeof hasAnswered>[0];

test("a Map with nothing on it is not a person to follow up", () => {
  // 329 rows like this arrived in one hour on 8 October, from a test script that bounced in
  // and out of the welcome screen. Real bounces make them too, and a page full of them hides
  // the handful of women who actually answered.
  assert.equal(hasAnswered(row()), false);
  assert.equal(hasAnswered(row({ focus_topics: [], tried: [] })), false);
});

test("one answer of any kind is enough to count as somebody", () => {
  assert.equal(hasAnswered(row({ age_band: "40-49" })), true);
  assert.equal(hasAnswered(row({ life_stage: "perimenopause" })), true);
  assert.equal(hasAnswered(row({ caring_for: "parent" })), true);
  assert.equal(hasAnswered(row({ duration: "1-3y" })), true);
  assert.equal(hasAnswered(row({ focus_topics: ["gut"] })), true);
  assert.equal(hasAnswered(row({ tried: ["diets"] })), true);
  assert.equal(hasAnswered(row({ score_space: 0 })), true, "a score of zero is still an answer");
});

/* --------------------------------------------------------- when she came ------------ */

test("when she came reads the way Rê would say it", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  assert.equal(whenWas(ago(0), COPY.pt, now), "hoje");
  assert.equal(whenWas(ago(1), COPY.pt, now), "ontem");
  assert.equal(whenWas(ago(5), COPY.pt, now), "há 5 dias");
  assert.equal(whenWas(ago(0), COPY.en, now), "today");
  assert.equal(whenWas(ago(1), COPY.en, now), "yesterday");
  assert.equal(whenWas(ago(5), COPY.en, now), "5 days ago");
});

/* ------------------------------------------------------------ what went -------------- */

test("the filter chips are gone, and nothing still refers to them", () => {
  const src = ["pt", "en"].flatMap((l) => Object.values(COPY[l as "pt" | "en"]).map(String)).join(" ");
  for (const gone of ["Mostrar todos", "Filtrar", "Nenhum Mapa com esses filtros"]) {
    assert.ok(!src.includes(gone), `${gone} should be gone`);
  }
});
