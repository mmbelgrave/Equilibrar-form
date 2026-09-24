"use client";

import { useTranslations } from "next-intl";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { PILLARS, STEP_OF, bandOf, type Pillar, type Scores } from "@/lib/scoring";

/**
 * The Pillar Wheel (spec §7): six equal 60° segments in fixed method order, clockwise,
 * the first centred at the top. Each segment is drawn from the centre to score/100 of
 * the radius. Colour encodes the step; every segment is labelled with name and score.
 * Hand-written SVG, no chart library.
 */

const VB = 200; // SVG viewBox size
const C = VB / 2;
const R = 96; // full radius in viewBox units (room for the ring stroke)
const GAP = 4; // px between the ring and a label
const MAX_R = 170; // px, wheel radius cap on wide screens
const MIN_R = 64;
const COS30 = Math.cos(Math.PI / 6);

/** Angle (degrees, clockwise from the top) at the middle of segment i. */
const midAngle = (i: number) => i * 60;

function point(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function wedge(i: number, score: number): string | null {
  if (score <= 0) return null;
  const r = (R * score) / 100;
  const [x0, y0] = point(midAngle(i) - 30, r);
  const [x1, y1] = point(midAngle(i) + 30, r);
  return `M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

type Side = "top" | "right" | "bottom" | "left";
const SIDE: Side[] = ["top", "right", "right", "bottom", "left", "left"];

type Layout = { width: number; r: number; cx: number; cy: number; height: number };

export function Wheel({
  scores,
  animate,
  selected,
  onSelect,
}: {
  scores: Scores;
  animate: boolean;
  selected: Pillar | null;
  onSelect: (p: Pillar | null) => void;
}) {
  const t = useTranslations();
  const boxRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);

  // Size the wheel to the room the real (Portuguese or English) labels leave.
  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const width = box.clientWidth;
    const w = labelRefs.current.map((el) => el?.offsetWidth ?? 0);
    const h = labelRefs.current.map((el) => el?.offsetHeight ?? 0);
    const leftMax = Math.max(w[4], w[5]);
    const rightMax = Math.max(w[1], w[2]);
    const r = Math.max(MIN_R, Math.min(MAX_R, (width - leftMax - rightMax) / (2 * COS30) - GAP));
    const spread = COS30 * (r + GAP);
    const slack = Math.max(0, width - leftMax - rightMax - 2 * spread);
    const cx = leftMax + spread + slack / 2;
    const cy = h[0] + GAP + r;
    const height = cy + r + GAP + h[3];
    setLayout({ width, r, cx, cy, height });
  }, []);

  // The labels change with the language, and a switch happens in place, so the sizes are
  // part of what this effect depends on (review 1 finding 2, back again in review 3).
  const labelText = PILLARS.map((p) => t(`pillar.${p}`)).join("|");
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    // Labels change size when the language switches in place; re-measure then too.
    labelRefs.current.forEach((el) => el && ro.observe(el));
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure, labelText]);

  function labelStyle(i: number): React.CSSProperties {
    if (!layout) return { position: "absolute", left: 0, top: 0, visibility: "hidden" };
    const { r, cx, cy } = layout;
    const [dx, dy] = [Math.sin((midAngle(i) * Math.PI) / 180), -Math.cos((midAngle(i) * Math.PI) / 180)];
    const x = cx + dx * (r + GAP);
    const y = cy + dy * (r + GAP);
    const transform = {
      top: "translate(-50%, -100%)",
      bottom: "translate(-50%, 0)",
      right: "translate(0, -50%)",
      left: "translate(-100%, -50%)",
    }[SIDE[i]];
    return { position: "absolute", left: x, top: y, transform };
  }

  const size = layout ? layout.r * 2 : 0;

  return (
    <div
      ref={boxRef}
      className="relative w-full"
      style={{ height: layout?.height ?? 320 }}
      role="group"
      aria-label={t("result.wheelLabel")}
    >
      {layout && (
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          width={size}
          height={size}
          style={{ position: "absolute", left: layout.cx - layout.r, top: layout.cy - layout.r }}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            {(["claim", "recover", "build"] as const).map((step, k) => (
              <pattern
                key={step}
                id={`tex-${step}`}
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${[45, 90, 135][k]})`}
              >
                <line x1="0" y1="0" x2="0" y2="5" className="tex-line" strokeWidth="1.6" />
              </pattern>
            ))}
          </defs>
          {/* The 100 boundary, so a short segment reads as a gap rather than as nothing. */}
          <circle cx={C} cy={C} r={R} fill="var(--color-rose-50)" stroke="var(--color-line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {PILLARS.map((p, i) => {
            const d = wedge(i, scores[p]);
            if (!d) return null;
            return (
              <g
                key={p}
                className={"seg" + (animate ? " seg-animate" : "")}
                style={animate ? { animationDelay: `${i * 60}ms` } : undefined}
              >
                <path
                  d={d}
                  className={`fill-${STEP_OF[p]}`}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={selected && selected !== p ? 0.55 : 1}
                  onClick={() => onSelect(selected === p ? null : p)}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
        </svg>
      )}
      {PILLARS.map((p, i) => (
        <button
          key={p}
          type="button"
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          style={labelStyle(i)}
          aria-pressed={selected === p}
          onClick={() => onSelect(selected === p ? null : p)}
          className={
            "flex min-h-11 min-w-11 cursor-pointer flex-col rounded-lg px-1 py-1 leading-tight whitespace-nowrap " +
            (SIDE[i] === "left" ? "items-end text-right " : SIDE[i] === "right" ? "items-start text-left " : "items-center text-center ") +
            (selected === p ? "bg-rose-100" : "")
          }
        >
          <span className="t-wheel-label">{t(`pillar.${p}`)}</span>
          <span className="t-num text-ink">
            {scores[p]}
            <span className="sr-only">
              {" "}
              — {t(`band.${bandOf(scores[p])}`)}. {t("result.col.step")}: {t(`step.${STEP_OF[p]}`)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
