# The Equilibrar Map

A free, bilingual (Brazilian Portuguese and English) self-assessment for
**Equilibrar — Nutrição e Fitness, by Rê**. A woman answers six short questions about her
life and 24 statements about her everyday, and gets back a wheel of six areas, the area
where she has least support right now, and one thing she could try this week.

It is a lifestyle tool, not a medical one, and it says so on screen in both languages.

**Live site:** see the repository's Pages link (Settings → Pages).

## What it does

- Six context questions, then 24 statements in a fixed order, one per screen on a phone.
- Scores each of the six areas 0–100, suggests a focus, and explains that she still begins
  at the first step of the method — and that where she actually starts is her decision.
- Portuguese is the default; English is one tap away, and the language lives in the URL.
- Works on a phone, by keyboard, and with the browser's reduced-motion setting.

## Privacy by design

There is no account, no cookie, no analytics and no third-party request; the fonts are part
of this repository.

While she answers, everything is kept in her own browser. What reaches the database is
anonymous: her context and journey answers as codes, and a pillar score once its four
statements are done. Her name, anything she wrote in her own words, her 24 individual
answers and the health check-in stay on her device.

She becomes a person only when she presses "Share my Map with Rê". Her name, her email and
what she typed on that form go then. Her own words and her 24 individual answers each need
their own tick, and sharing works without either. The check-in never leaves her device,
under any circumstance.

## Running it

Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000/pt/mapa
npm test           # scoring, copy rules, colours and contrast, privacy rules
npm run typecheck
npm run lint
```

Build the published version (a plain static site in `.next-export/`):

```bash
npm run build:static
npm run serve:static   # http://localhost:3218
```

On GitHub Pages the site lives in a sub-folder, so the build there sets
`NEXT_PUBLIC_BASE_PATH` to the repository name (see `.github/workflows/deploy.yml`).

## Status

First version: the questions, scoring, result, wheel and both languages. Email, PDF, the
return visit ("Re-Map") and the admin dashboard come later and need accounts.

Some wording is still placeholder text written by the developer and is marked as draft in
the team notes; the pathway buttons are placeholders; the privacy notice is a draft for a
lawyer to check.

## Built with

Next.js (App Router), Tailwind CSS, next-intl, and a hand-written SVG wheel.

## Credits

Logo, brand and content: Equilibrar by Rê. Fonts: Poiret One, Jost, Lato and Sacramento,
under the SIL Open Font License (`src/fonts/LICENSE-OFL.txt`).
