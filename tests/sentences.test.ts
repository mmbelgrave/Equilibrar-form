// Every answer that gets dropped into a sentence, checked as the finished sentence —
// the gap review round 3 found (a menu label read as nonsense inside block 3).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DURATIONS, OBSTACLES, TOPICS, TRIED } from "../src/lib/scoring.ts";

const load = (l: string) =>
  JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
const M = { pt: load("pt"), en: load("en") };
const LOCALES = ["pt", "en"] as const;

/** Fills {placeholders} the way the screen does. */
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => {
    assert.ok(k in values, `no value for {${k}}`);
    return values[k];
  });

test("every answer has a sentence-fragment form in both languages", () => {
  for (const l of LOCALES) {
    for (const code of TOPICS) assert.ok(M[l][`topicIn.${code}`], `${l}: topicIn.${code}`);
    for (const code of DURATIONS) assert.ok(M[l][`durationFor.${code}`], `${l}: durationFor.${code}`);
    for (const code of TRIED) assert.ok(M[l][`triedIn.${code}`], `${l}: triedIn.${code}`);
    for (const code of OBSTACLES) assert.ok(M[l][`obstacleIn.${code}`], `${l}: obstacleIn.${code}`);
  }
});

test("fragments are lower case and are not whole sentences", () => {
  for (const l of LOCALES) {
    for (const prefix of ["topicIn", "durationFor", "triedIn", "obstacleIn"]) {
      for (const [k, v] of Object.entries(M[l])) {
        if (!k.startsWith(`${prefix}.`)) continue;
        assert.equal(v, v.replace(/^./, (ch) => ch.toLocaleLowerCase(l)), `${l}:${k} starts with a capital`);
        assert.ok(!/[.!?]$/.test(v), `${l}:${k} ends like a sentence`);
      }
    }
  }
});

test("block 3 reads properly for every health topic, in both languages", () => {
  for (const l of LOCALES) {
    for (const code of TOPICS) {
      const topic = M[l][`topicIn.${code}`];
      const sentence = fill(M[l]["result.connection"], {
        topics: topic,
        topic,
        a: M[l]["pillar.sleep"],
        b: M[l]["pillar.calm"],
        phrase: M[l]["phrase.sleep"],
      });
      assert.ok(!/\{|\}/.test(sentence), `${l}:${code} still has a placeholder`);
      // "because of I just want to feel better overall" — a label dropped in raw.
      assert.ok(!/(de|of) [A-ZÀ-Ý]/.test(sentence), `${l}:${code} — ${sentence}`);
      assert.ok(sentence.length > 80, `${l}:${code} looks truncated`);
    }
  }
});

test("block 7 reads properly for every length of time", () => {
  for (const l of LOCALES) {
    for (const code of DURATIONS) {
      const sentence = fill(M[l]["result.herWordsDuration"], { duration: M[l][`durationFor.${code}`] });
      assert.ok(!/\{|\}/.test(sentence));
      assert.ok(!/há de |for from /.test(sentence), `${l}:${code} — ${sentence}`);
    }
  }
});

test("block 4 reads properly for what she tried and what got in the way", () => {
  for (const l of LOCALES) {
    for (const tried of TRIED.filter((t) => t !== "nothing")) {
      for (const obstacle of OBSTACLES) {
        const sentence = fill(M[l]["result.notYou"], {
          tried: M[l][`triedIn.${tried}`],
          obstacles: M[l][`obstacleIn.${obstacle}`],
        });
        assert.ok(!/\{|\}/.test(sentence));
        assert.ok(!/(quando|when) [A-ZÀ-Ý]/.test(sentence), `${l}: ${sentence}`);
      }
    }
  }
});

test("block 6 names Step 1 by name, so Claim / Ocupar is always on the result", () => {
  for (const l of LOCALES) {
    const sentence = fill(M[l]["result.begin"], { a: M[l]["pillar.sleep"] });
    assert.ok(sentence.includes(M[l]["step.claim"]), `${l}: ${sentence}`);
  }
});

test("every sentence with placeholders has a value for each of them on screen", () => {
  // Guards against a message gaining a new {placeholder} that nothing fills.
  const known: Record<string, string[]> = {
    "result.hello": ["name"],
    "result.focus": ["a", "b"],
    "result.focusAllStrong": ["a", "b"],
    "result.connection": ["topics", "topic", "a", "b", "phrase"],
    "result.notYou": ["tried", "obstacles"],
    "result.begin": ["a"],
    "result.herWords": ["vision"],
    "result.herWordsDuration": ["duration"],
    "result.date": ["date"],
    "result.detail": ["pillar", "score", "band", "step"],
    "question.progress": ["n", "total"],
    "question.progressLabel": ["n", "total"],
    "step.chip": ["n", "step"],
  };
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(M[l])) {
      const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      if (used.length === 0) continue;
      assert.ok(known[k], `${l}:${k} has placeholders but is not in the list the screens fill`);
      for (const p of used) assert.ok(known[k].includes(p), `${l}:${k} uses {${p}}, which nothing fills`);
    }
  }
});
