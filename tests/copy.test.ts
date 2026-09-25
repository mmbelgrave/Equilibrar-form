import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const load = (l: string) =>
  JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
const pt = load("pt");
const en = load("en");
const PILLARS = ["space", "routine", "sleep", "calm", "food", "strength"];

test("both locales have exactly the same keys", () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
});

test("no empty strings", () => {
  for (const [l, m] of [["pt", pt], ["en", en]] as const) {
    for (const [k, v] of Object.entries(m)) assert.ok(v.trim().length > 0, `${l}:${k} is empty`);
  }
});

test("24 statements and 5 scale points in both languages", () => {
  for (const m of [pt, en]) {
    for (let i = 1; i <= 24; i++) assert.ok(m[`q${i}`], `q${i}`);
    for (let i = 0; i <= 4; i++) assert.ok(m[`scale.${i}`], `scale.${i}`);
  }
});

test("spec v3 wording: kept statements, the scale, pillar and step names", () => {
  assert.equal(pt.q1, "Numa semana normal, eu tenho um tempo que é só meu");
  assert.equal(pt.q19, "A minha relação com a comida é tranquila — sem regras e sem culpa");
  assert.equal(en.q16, "I get through my day without feeling overwhelmed or on edge");
  assert.equal(en.q20, "I eat when I'm hungry and stop when I'm satisfied, not driven by cravings or emotions");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => pt[`scale.${i}`]), ["Nunca", "Raramente", "Às vezes", "Quase sempre", "Sempre"]);
  assert.deepEqual(
    PILLARS.map((p) => pt[`pillar.${p}`]),
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

test("the 'Map suggests; it does not decide' line, exactly as the spec writes it", () => {
  assert.equal(
    en["result.decide"],
    "Your Map helps you notice where support may be useful. Your priorities, your circumstances and any professional advice help decide where you actually begin.",
  );
  assert.equal(
    pt["result.decide"],
    "O seu Mapa ajuda você a perceber onde um apoio pode ser útil. As suas prioridades, a sua realidade e qualquer orientação profissional ajudam a decidir por onde você realmente começa.",
  );
});

test("spec v3: nine about-you questions, five journey questions, three path cards", () => {
  for (const m of [pt, en]) {
    for (let i = 0; i <= 8; i++) assert.ok(m[`c${i}.q`], `c${i}.q`);
    for (let i = 1; i <= 5; i++) assert.ok(m[`j${i}.q`], `j${i}.q`);
    for (const p of ["community", "consultoria", "mentorship"]) {
      for (const f of ["name", "promise", "length", "covers", "continues", "forYou"]) {
        assert.ok(m[`path.${p}.${f}`], `path.${p}.${f}`);
      }
    }
  }
  assert.match(en["c7.hint"], /two/);
});

test("every pillar has its conclusion copy: a phrase, three work columns and a practice", () => {
  for (const m of [pt, en]) {
    for (const p of PILLARS) {
      assert.ok(m[`phrase.${p}`], `phrase.${p}`);
      assert.ok(m[`practice.${p}`], `practice.${p}`);
      for (const f of ["looksLike", "weDo", "towards"]) assert.ok(m[`work.${p}.${f}`], `work.${p}.${f}`);
    }
  }
});

test("it invites, never pressures: no countdown, scarcity, deadline or promised result (§2)", () => {
  const banned = [
    /only \d+ (places|spots)/i, /last chance/i, /\bhurry up\b/i, /deadline/i, /guarantee/i,
    /garantia/i, /últimas vagas/i, /prazo final/i, /resultado garantido/i, /vagas limitadas/i,
  ];
  for (const [l, m] of [["pt", pt], ["en", en]] as const) {
    for (const [k, v] of Object.entries(m)) {
      for (const re of banned) assert.ok(!re.test(v), `${l}:${k} — ${v}`);
    }
  }
});

test("no result copy calls her focus a 'priority' or an instruction", () => {
  for (const m of [pt, en]) {
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith("result.") && !k.startsWith("paths.")) continue;
      assert.ok(!/\bpriority\b|pilar mais baixo|lowest pillar/i.test(v), `${k}: ${v}`);
    }
  }
});

test("disclaimer present in both languages, as in the spec", () => {
  assert.match(pt.disclaimer, /não substitui o seu médico/);
  assert.match(en.disclaimer, /does not replace your doctor/);
});

test("the result always says everyone begins at Claim", () => {
  for (const m of [pt, en]) {
    assert.ok(m["result.begin"].includes(m["pillar.space"]));
    assert.ok(m["result.begin"].includes(m["pillar.routine"]));
    assert.ok(m["result.beginIsClaim"]);
  }
});

test("the paths screen says signing up is not possible yet, and the price is not invented", () => {
  for (const m of [pt, en]) {
    assert.ok(m["paths.soon"]);
    assert.ok(m["paths.priceTbc"]);
    assert.ok(!/€|\$|R\$/.test(Object.values(m).join(" ")), "no price is shown until the review");
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

test("no key is a prefix of another, which would turn a sentence into a group", () => {
  // next-intl reads dots as nesting: "result.begin" and "result.begin.isClaim" cannot both exist.
  for (const [l, m] of [["pt", pt], ["en", en]] as const) {
    const keys = Object.keys(m);
    for (const k of keys) {
      const clash = keys.find((other) => other !== k && other.startsWith(k + "."));
      assert.ok(!clash, `${l}: "${k}" is both a sentence and the start of "${clash}"`);
    }
  }
});

// Review 5, finding 1: the privacy notice and the consent she ticks must describe what the
// app actually does. While no database is configured that is "nothing is sent"; once Rê's
// database is on it is "an anonymous Map is saved". Both sentences have to exist, and the
// promise must never be made in the sentence that is shown when saving is on.
test("no sentence shown with the database on claims that nothing is sent", () => {
  for (const [locale, messages] of Object.entries({ pt, en })) {
    for (const key of ["privacy.p1", "privacy.p1Saving", "privacy.p6Share", "share.localShared", "welcome.saving"]) {
      assert.ok(messages[key], `${locale} is missing ${key}`);
    }
    const saving = [messages["privacy.p1"], messages["privacy.p1Saving"], messages["share.localShared"]].join(" ").toLowerCase();
    for (const claim of ["nada do que você responde sai", "nada é enviado", "nothing you answer leaves", "nothing is sent"]) {
      assert.ok(!saving.includes(claim), `${locale}: "${claim}" cannot be said once the database is on`);
    }
    // And the other way round: the sentence for a site with no database still says it plainly.
    assert.ok(
      /nada é enviado|nothing is sent/i.test(messages["share.local"]),
      `${locale}: share.local should still say nothing is sent`,
    );
  }
});

test("the contact form carries the way out and a link to the privacy notice (§13)", () => {
  for (const [locale, messages] of Object.entries({ pt, en })) {
    assert.ok(messages["contact.leaving"], `${locale} contact.leaving`);
    assert.ok(messages["contact.privacyLink"], `${locale} contact.privacyLink`);
  }
});

test("nothing promises the PDF or the email sequence before they exist", () => {
  for (const [locale, messages] of Object.entries({ pt, en })) {
    assert.ok(!/pdf/i.test(messages["contact.consentEmail"]), `${locale}: consentEmail still promises a PDF`);
  }
});
