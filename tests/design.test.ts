import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `token ${name}`);
  return m[1].toLowerCase();
};

test("tokens match spec v2 §7–§8 exactly (values read from the logo)", () => {
  const spec: Record<string, string> = {
    "rose-500": "#cfa1a6", "plum-600": "#7f5782", white: "#ffffff",
    "rose-600": "#ba8a90", "rose-700": "#96686e", "rose-100": "#f7eced", "rose-50": "#fcf8f8",
    "plum-700": "#6a4770", "plum-100": "#efe7f0",
    ink: "#3a3330", "ink-muted": "#7a716c", line: "#e3d5d2", surface: "#ffffff",
    attention: "#a65a43", focus: "#7f5782",
    "step-claim": "#b03a6a", "step-recover": "#3d5aa0", "step-build": "#6e8b2e",
  };
  for (const [k, v] of Object.entries(spec)) assert.equal(token(k), v, k);
});

test("Tailwind's default palette is removed, so no red/amber/green utility exists", () => {
  assert.match(css, /--color-\*:\s*initial/);
});

function lum(hex: string) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("text contrast ≥ 4.5:1 for the pairs the app uses", () => {
  const pairs = [
    // body and helper text
    ["ink", "rose-50"], ["ink", "surface"], ["ink", "rose-100"], ["ink", "plum-100"], ["ink-muted", "surface"],
    // text links and section labels (plum-600, see PROGRESS decision 7)
    ["plum-600", "rose-50"], ["plum-600", "surface"], ["plum-600", "rose-100"],
    // headings
    ["plum-700", "rose-50"], ["plum-700", "surface"],
    // language toggle on the logo's rose band
    ["ink", "rose-500"],
    // check-in panel accent text
    ["attention", "surface"],
  ];
  for (const [fg, bg] of pairs) {
    const r = contrast(token(fg), token(bg));
    assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}`);
  }
});

test("the rose-700 link colour fails on the page, which is why links are plum-600", () => {
  assert.ok(contrast(token("rose-700"), token("rose-50")) < 4.5);
});

test("primary button: white on rose-700 ≥ 4.5:1", () => {
  assert.ok(contrast("#ffffff", token("rose-700")) >= 4.5);
});

test("wheel step colours ≥ 3:1 against the surface", () => {
  for (const s of ["step-claim", "step-recover", "step-build"]) {
    const r = contrast(token(s), token("surface"));
    assert.ok(r >= 3, `${s}: ${r.toFixed(2)}`);
  }
});

test("the four spec fonts are self-hosted files in the repo", () => {
  const dir = fileURLToPath(new URL("../src/fonts/", import.meta.url));
  const files = readdirSync(dir);
  for (const f of ["poiret-one", "jost", "lato", "sacramento"]) {
    assert.ok(files.some((n) => n.startsWith(f) && n.endsWith(".woff2")), f);
  }
  const fonts = readFileSync(fileURLToPath(new URL("../src/lib/fonts.ts", import.meta.url)), "utf8");
  assert.match(fonts, /next\/font\/local/);
});

// Phase 2 adds exactly two outside addresses, both from the spec: Rê's own Supabase project
// (only when configured, and only for saving and sharing) and the wa.me link she taps to
// message Rê. Anything else — fonts, analytics, trackers — is still forbidden.
const ALLOWED_HOSTS = [/wa.me/, /supabase/];

test("no Google Fonts or other third-party URLs in the source", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(fileURLToPath(new URL("../src/", import.meta.url)))) {
    if (!/\.(ts|tsx|css|json)$/.test(f)) continue; // the fonts' open licence text names its own URL
    const src = readFileSync(f, "utf8");
    for (const call of [...src.matchAll(/https?:\/\/[^\s"'`]+/g)].map((m) => m[0])) {
      if (/www\.w3\.org/.test(call) || ALLOWED_HOSTS.some((host) => host.test(call))) continue;
      assert.fail(`${f} calls out to ${call}`);
    }
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(src), `${f} loads fonts from Google`);
  }
});
