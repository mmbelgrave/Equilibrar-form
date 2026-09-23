import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const load = (l: string) =>
  JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
const pt = load("pt");
const en = load("en");

test("both locales have exactly the same keys", () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
});

test("no empty strings", () => {
  for (const [l, m] of [["pt", pt], ["en", en]] as const) {
    for (const [k, v] of Object.entries(m)) assert.ok(v.trim().length > 0, `${l}:${k} is empty`);
  }
});

test("24 questions and 5 scale points in both languages", () => {
  for (const m of [pt, en]) {
    for (let i = 1; i <= 24; i++) assert.ok(m[`q${i}`], `q${i}`);
    for (let i = 0; i <= 4; i++) assert.ok(m[`scale.${i}`], `scale.${i}`);
  }
});

test("spec wording kept: sample questions, scale, pillar and step names (PT)", () => {
  assert.equal(pt.q1, "Numa semana normal, eu tenho um tempo que é só meu");
  assert.equal(pt.q16, "Eu passo o meu dia sem me sentir no limite");
  assert.equal(en.q16, "I get through my day without feeling on edge");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => pt[`scale.${i}`]), ["Nunca", "Raramente", "Às vezes", "Quase sempre", "Sempre"]);
  assert.deepEqual(
    ["space", "routine", "sleep", "calm", "food", "strength"].map((p) => pt[`pillar.${p}`]),
    ["Espaço", "Rotina", "Sono", "Calma", "Alimentação", "Força"],
  );
  assert.deepEqual(["claim", "recover", "build"].map((s) => pt[`step.${s}`]), ["Ocupar", "Recuperar", "Construir"]);
});

// Spec §2 / §15. The mandated not-a-medical-test line itself names "diagnosis" and
// "screening" in order to deny them, so that one key is the only exception.
const FORBIDDEN = [
  /\bdiagnos/i, /\bscreening/i, /\brisk/i, /\bdeficien/i, /\bdisorder/i,
  /diagn[óo]stic/i, /rastrei/i, /rastream/i, /triagem/i, /\bris[cq]o/i, /defici[êe]ncia/i, /dist[úu]rbio/i, /transtorno/i,
];
const ALLOWED_KEYS = new Set(["disclaimer"]);

test("forbidden medical words appear nowhere except the disclaimer", () => {
  for (const [l, m] of [["pt", pt], ["en", en]] as const) {
    for (const [k, v] of Object.entries(m)) {
      if (ALLOWED_KEYS.has(k)) continue;
      for (const re of FORBIDDEN) assert.ok(!re.test(v), `${l}:${k} contains ${re}: "${v}"`);
    }
  }
});

test("spec v2 wording: 'the Map suggests; it does not decide' line, exactly", () => {
  assert.equal(en["result.decide"], "Your Map helps you notice where support may be useful. Your priorities, your circumstances and any professional advice help decide where you actually begin.");
  assert.equal(pt["result.decide"], "O seu Mapa ajuda você a perceber onde um apoio pode ser útil. As suas prioridades, a sua realidade e qualquer orientação profissional ajudam a decidir por onde você realmente começa.");
});

test("spec v2 context questions C1–C6 in both languages, as in the spec", () => {
  assert.equal(pt["c1.q"], "Em que fase da vida você está, mais ou menos?");
  assert.equal(en["c5.q"], "Are you being treated for anything at the moment?");
  assert.equal(pt["c6.q"], "O que te trouxe aqui hoje, com as suas palavras?");
  for (const m of [pt, en]) for (let i = 1; i <= 6; i++) assert.ok(m[`c${i}.q`], `c${i}.q`);
  for (const m of [pt, en]) assert.match(m["result.ctx.treatment"], /(treatment|tratamento)/);
});

test("no result copy calls the focus a 'priority' or 'lowest pillar' instruction", () => {
  for (const m of [pt, en]) {
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith("result.") && !k.startsWith("next.")) continue;
      assert.ok(!/\bpriority\b|pilar mais baixo|lowest pillar/i.test(v), `${k}: ${v}`);
    }
  }
});

test("disclaimer present in both languages, as in the spec", () => {
  assert.match(pt.disclaimer, /não substitui o seu médico/);
  assert.match(en.disclaimer, /does not replace your doctor/);
});

test("every priority pillar has a 'we still start at Claim' line and one action", () => {
  for (const m of [pt, en]) {
    for (const p of ["space", "routine", "sleep", "calm", "food", "strength"]) {
      assert.ok(m[`result.action.${p}`], p);
      assert.ok(m[`result.startClaim.${p}`].includes(m["step.claim"]), `${p} line names ${m["step.claim"]}`);
    }
  }
});

// Components must take all copy from the JSON files (spec §11).
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

test("no hard-coded words between JSX tags in components", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const allowed = new Set<string>();
  for (const f of tsxFiles(root)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/>\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,.'’!?-]*)\s*</g)) {
      const text = m[1].trim();
      if (!text || allowed.has(text)) continue;
      assert.fail(`${f}: hard-coded text "${text}"`);
    }
    for (const m of src.matchAll(/aria-label="([^"]+)"/g)) assert.fail(`${f}: hard-coded aria-label "${m[1]}"`);
  }
});
