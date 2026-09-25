"use client";

import { useTranslations } from "next-intl";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { PILLARS, STEP_OF, bandOf, type Pillar, type Scores } from "@/lib/scoring";
import { TIGHT_HYSTERESIS, WHEEL, wheelLayout } from "@/lib/sentences";

/**
 * The Pillar Wheel (spec §7): six equal 60° segments in fixed method order, clockwise,
 * the first centred at the top. Each segment is drawn from the centre to score/100 of
 * the radius. Colour encodes the step; every segment is labelled with name and score.
 * Hand-written SVG, no chart library.
 */

const VB = 200; // SVG viewBox size
const C = VB / 2;
const R = 96; // full radius in viewBox units (room for the ring stroke)
const GAP = WHEEL.gap; // px between the ring and a label

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

type Layout = { width: number; r: number; cx: number; cy: number; height: number; fits: boolean };

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
  // Smaller labels on a screen too narrow for the full ones. Leaving that state needs room
  // to spare, so the two sizes cannot take turns on the same screen.
  const [tight, setTight] = useState(false);
  // The widths of the full-size labels. Whether to shrink them is always judged against
  // these, never against the shrunken ones — otherwise the two sizes take turns.
  const fullLabelWidths = useRef<number[] | null>(null);
  const tightRef = useRef(false);

  // Size the wheel to the room the real (Portuguese or English) labels leave.
  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const width = box.clientWidth;
    const w = labelRefs.current.map((el) => el?.offsetWidth ?? 0);
    const h = labelRefs.current.map((el) => el?.offsetHeight ?? 0);
    if (!tightRef.current) fullLabelWidths.current = w;
    const full = wheelLayout(width, fullLabelWidths.current ?? w, h);
    setLayout({ width, ...wheelLayout(width, w, h) });
    setTight((was) => (was ? full.ideal < WHEEL.min + TIGHT_HYSTERESIS : !full.fits));
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
    // Turning the phone sideways, or any other window change: some browsers do not deliver
    // the observer's callback for those, so the window is watched as well.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure, labelText]);

  // The labels change size one render after the switch, so the layout is taken again once
  // the new sizes are on screen.
  useLayoutEffect(() => {
    tightRef.current = tight;
    // Two frames: one for the browser to apply the new label size, one to measure it.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [tight, measure]);

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
      className={"relative w-full" + (tight ? " wheel-tight" : "")}
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
                {/* Paper only: the same wedge again in its step's texture, drawn over the
                    colour rather than instead of it, so the three steps stay apart on a
                    printer with one cartridge (review 6, finding 8). */}
                <path
                  d={d}
                  className={`seg-texture-${STEP_OF[p]}`}
                  stroke="none"
                  aria-hidden="true"
                  pointerEvents="none"
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
