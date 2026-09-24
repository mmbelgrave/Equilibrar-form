"use client";

import { useTranslations } from "next-intl";
import { sortedByScore, type Pillar, type Scores } from "@/lib/scoring";

/**
 * The list view (spec §7): the bars carry the real reading. One measure, so one colour
 * for all six; her two focus pillars at full brand rose, the others at 45% of the same hue.
 */
export function Bars({ scores, focus }: { scores: Scores; focus: [Pillar, Pillar] }) {
  const t = useTranslations();
  return (
    <ul className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-3" role="list">
      {sortedByScore(scores).map((p) => (
        <li key={p} className="contents">
          <span className={"t-pillar " + (focus.includes(p) ? "" : "font-normal")}>{t(`pillar.${p}`)}</span>
          {/* Zero baseline on the left; the value sits at the end of the bar. The bar's
              full length leaves room for a 3-digit value. */}
          <span className="flex min-w-0 items-center gap-2 border-l border-line">
            <span
              className="bar-fill block h-3 flex-none rounded-r-[4px] bg-rose-500"
              style={{ width: `calc((100% - 3ch - 8px) * ${scores[p] / 100})`, opacity: focus.includes(p) ? 1 : 0.45 }}
              aria-hidden="true"
            />
            <span className="t-num text-ink">{scores[p]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
