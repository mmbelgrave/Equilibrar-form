// Every answer that gets dropped into a sentence, checked as the finished sentence, using
// the same helpers the screens use. Review 3 found a menu label reading as nonsense inside
// block 3; review 4 found two joined answers reading as a chain of "and"s.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { joinFragments, quoteReady, wheelLayout, WHEEL } from "../src/lib/sentences.ts";
import { DURATIONS, OBSTACLES, TOPICS, TRIED, emptyJourney, journeyComplete, triedNothing } from "../src/lib/scoring.ts";

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

const AND = { pt: /\be\b/g, en: /\band\b/g };

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

test("block 3 reads properly for every health topic, one at a time", () => {
  for (const l of LOCALES) {
    for (const code of TOPICS) {
      const topic = M[l][`topicIn.${code}`];
      const sentence = fill(M[l]["result.connection"], {
        topics: joinFragments(l, [topic]),
        topic,
        a: M[l]["pillar.sleep"],
        b: M[l]["pillar.calm"],
        phrase: M[l]["phrase.sleep"],
      });
      assert.ok(!/\{|\}/.test(sentence), `${l}:${code} still has a placeholder`);
      // A raw menu label dropped in mid-sentence, e.g. "because of I just want to…".
      assert.ok(!/(de|of) [A-ZÀ-Ý]/.test(sentence), `${l}:${code} — ${sentence}`);
    }
  }
});

test("two topics joined never make a chain of 'and's (review 4, finding 1)", () => {
  for (const l of LOCALES) {
    for (const a of TOPICS) {
      for (const b of TOPICS) {
        if (a === b) continue;
        const joined = joinFragments(l, [M[l][`topicIn.${a}`], M[l][`topicIn.${b}`]]);
        const sentence = fill(M[l]["result.connection"], {
          topics: joined,
          topic: M[l][`topicIn.${a}`],
          a: M[l]["pillar.sleep"],
          b: M[l]["pillar.calm"],
          phrase: M[l]["phrase.sleep"],
        });
        // The joiner must not add a conjunction of its own on top of the ones inside the
        // fragments: "querer se sentir melhor no geral e digestão e intestino".
        const inFragments = (M[l][`topicIn.${a}`].match(AND[l])?.length ?? 0) + (M[l][`topicIn.${b}`].match(AND[l])?.length ?? 0);
        const inJoined = joined.match(AND[l])?.length ?? 0;
        assert.equal(inJoined, inFragments, `${l}: ${a} + ${b} → ${joined}`);
        assert.ok(!/\{|\}/.test(sentence));
      }
    }
  }
});

test("two obstacles joined read as a list, not as one long clause", () => {
  for (const l of LOCALES) {
    for (const a of OBSTACLES) {
      for (const b of OBSTACLES) {
        if (a === b) continue;
        const joined = joinFragments(l, [M[l][`obstacleIn.${a}`], M[l][`obstacleIn.${b}`]]);
        const sentence = fill(M[l]["result.notYou"], { tried: joinFragments(l, [M[l]["triedIn.diets"]]), obstacles: joined });
        const inFragments = (M[l][`obstacleIn.${a}`].match(AND[l])?.length ?? 0) + (M[l][`obstacleIn.${b}`].match(AND[l])?.length ?? 0);
        assert.equal(joined.match(AND[l])?.length ?? 0, inFragments, `${l}: ${a} + ${b} → ${joined}`);
        assert.ok(!/(quando|when) [A-ZÀ-Ý]/.test(sentence), `${l}: ${sentence}`);
      }
    }
  }
});

test("three or more answers still join cleanly", () => {
  const three = joinFragments("pt", ["dietas ou planos alimentares", "suplementos", "terapia"]);
  assert.equal(three, "dietas ou planos alimentares, suplementos, terapia");
  assert.equal(joinFragments("en", ["supplements"]), "supplements");
  assert.equal(joinFragments("en", []), "");
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

test("her quote never ends with two full stops", () => {
  for (const l of LOCALES) {
    for (const vision of ["Acordar com energia.", "Acordar com energia", "Dormir bem!  ", "Ter tempo…"]) {
      const sentence = fill(M[l]["result.herWords"], { vision: quoteReady(vision) });
      assert.ok(!/[.!?]”\./.test(sentence) && !/\.\./.test(sentence), `${l}: ${sentence}`);
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
    "confirm.whatsappText": ["name"],
    // The five-email sequence (spec §12). Nothing sends these yet, so this list is the
    // contract the sender will have to meet: every one of these has to be filled, and
    // nothing else may appear in the copy without being added here first.
    "email.1.body": ["name", "link", "pillar", "practice"],
    "email.2.subject": ["pillar"],
    "email.2.body": ["name", "pillar", "why"],
    "email.3.body": ["name", "practice"],
    "email.4.body": ["name", "story"],
    "email.5.body": ["name", "paths", "link"],
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

/* ------------------------------------------- the wheel's geometry (review 4, finding 2) */

/** Label widths measured in the browser at 375 px: [Space, Routine, Sleep, Calm, Food, Strength]. */
const PT_LABELS = [64, 62, 53, 60, 100, 50];
const EN_LABELS = [58, 68, 50, 48, 46, 72];
const HEIGHTS = [44, 44, 44, 44, 44, 44];

test("the wheel fills the room the labels leave, and never spills past the edge", () => {
  for (const [name, labels] of [["pt", PT_LABELS], ["en", EN_LABELS]] as const) {
    for (const width of [280, 295, 335, 374, 560]) {
      const l = wheelLayout(width, labels, HEIGHTS);
      const leftLabel = Math.max(labels[4], labels[5]);
      const left = l.cx - WHEEL.cos30 * (l.r + WHEEL.gap) - leftLabel;
      const right = l.cx + WHEEL.cos30 * (l.r + WHEEL.gap) + Math.max(labels[1], labels[2]);
      if (l.fits) {
        assert.ok(left >= -0.5, `${name} at ${width}: left edge ${left.toFixed(1)}`);
        assert.ok(right <= width + 0.5, `${name} at ${width}: right edge ${right.toFixed(1)}`);
      } else {
        // Too narrow even for the smallest wheel: the screen switches to smaller labels.
        assert.ok(l.r === WHEEL.min);
      }
    }
  }
});

test("Portuguese labels are wider, so the Portuguese wheel is the smaller one", () => {
  const pt = wheelLayout(335, PT_LABELS, HEIGHTS);
  const en = wheelLayout(335, EN_LABELS, HEIGHTS);
  assert.ok(en.r > pt.r, `pt ${pt.r} vs en ${en.r}`);
  assert.ok(pt.r >= 90, `the Portuguese wheel should still be big: ${pt.r}`);
});

test("the wheel never grows past its cap on a wide screen", () => {
  assert.equal(wheelLayout(1200, EN_LABELS, HEIGHTS).r, WHEEL.max);
});

/* --------------------------------------- the journey rules (review 4, finding 4) */

test("'nothing yet' means the question about what got in the way is not needed", () => {
  const nothing = { ...emptyJourney(), tried: ["nothing"] as const, readiness: "learn" as const };
  assert.equal(triedNothing(nothing), true);
  assert.equal(journeyComplete({ ...nothing, obstacles: [] }), true);
});

test("anyone who tried something must still say what got in the way", () => {
  const tried = { ...emptyJourney(), tried: ["diets"] as const, readiness: "ready" as const };
  assert.equal(triedNothing(tried), false);
  assert.equal(journeyComplete({ ...tried, obstacles: [] }), false);
  assert.equal(journeyComplete({ ...tried, obstacles: ["time"] }), true);
});

test("'nothing yet' beside another answer is not 'nothing tried'", () => {
  const mixed = { ...emptyJourney(), tried: ["nothing", "diets"] as const, readiness: "ready" as const };
  assert.equal(triedNothing(mixed), false);
});

test("shrinking the labels is judged from their full size, so the two sizes cannot take turns", () => {
  const FULL = [64, 62, 53, 60, 100, 50];
  const SMALL = FULL.map((w) => Math.round(w * 0.87)); // the .wheel-tight step down
  // A width where the full labels do not fit: the small ones must not immediately claim
  // there is room again, or the wheel flips between two sizes on the same screen.
  const width = 260;
  assert.equal(wheelLayout(width, FULL, HEIGHTS).fits, false);
  const smallRoom = wheelLayout(width, SMALL, HEIGHTS).ideal;
  assert.ok(smallRoom >= WHEEL.min, "the small labels do fit — which is why the full ones decide");
  assert.ok(smallRoom < WHEEL.min + 30 + 25, "and they are not so roomy that the full ones would come straight back");
});
