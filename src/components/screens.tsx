"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Bars } from "@/components/Bars";
import { Wheel } from "@/components/Wheel";
import { PATHS, formatDate, type Locale } from "@/lib/i18n";
import { PATHWAY_URL, PROGRAMME_URL } from "@/lib/links";
import {
  CARING,
  PILLARS,
  QUESTION_COUNT,
  STAGES,
  STEPS,
  STEP_OF,
  TREATMENT,
  bandOf,
  pillarOfQuestion,
  scoresOf,
  type Answer,
  type Context,
  type MapResult,
  type Pillar,
  type Step,
} from "@/lib/scoring";

type HeadingRef = RefObject<HTMLHeadingElement | null>;

const stepNumber = (s: Step) => STEPS.indexOf(s) + 1;

function StepChip({ step }: { step: Step }) {
  const t = useTranslations();
  return (
    <span className="chip text-ink">
      <span className={`chip-dot bg-${step}`} aria-hidden="true" />
      {t("step.chip", { n: stepNumber(step), step: t(`step.${step}`) })}
    </span>
  );
}

function Disclaimer() {
  const t = useTranslations();
  return <p className="t-helper">{t("disclaimer")}</p>;
}

function BackLink({ onBack }: { onBack: () => void }) {
  const t = useTranslations();
  return (
    <button type="button" className="link inline-flex min-h-11 items-center" onClick={onBack}>
      <span aria-hidden="true">←&nbsp;</span>
      {t("question.back")}
    </button>
  );
}

/** "8 / 24", read out as "Question 8 of 24". */
function Progress({ n, total, label }: { n: number; total: number; label: string }) {
  return (
    <span className="t-num text-ink">
      <span aria-hidden="true">
        {n} / {total}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------ The answer control (spec §10) */

type Option<V> = { value: V; label: string };

/**
 * Full-width stacked options as one radio group: one Tab stop, arrows move, number keys
 * select, a tap advances after 250 ms, Enter advances once answered. Next stays disabled
 * until answered.
 */
function Choices<V extends string | number>({
  headingRef,
  headingId,
  title,
  label,
  progress,
  hint,
  options,
  value,
  onChoose,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  headingId: string;
  title: string;
  label: string;
  progress: React.ReactNode;
  hint?: string;
  options: Option<V>[];
  value: V | null;
  onChoose: (v: V) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function choose(v: V) {
    onChoose(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onNext, 250); // auto-advance (spec §10)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
        e.preventDefault();
        optionRefs.current[digit - 1]?.focus();
        choose(options[digit - 1].value);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const current = optionRefs.current.findIndex((el) => el === document.activeElement);
        const from = current === -1 ? selectedIndex : current;
        const to = e.key === "ArrowDown" ? Math.min(options.length - 1, from + 1) : Math.max(0, from - 1);
        optionRefs.current[to]?.focus();
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && value !== null) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Roving tab stop: the chosen option, or the first one.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <div className="flex items-center justify-between gap-4">
        <span className="t-label">{label}</span>
        {progress}
      </div>
      <h1 ref={headingRef} tabIndex={-1} id={headingId} className="t-question min-h-[3.9em] outline-none">
        {title}
      </h1>
      {hint && <p className="t-helper -mt-2">{hint}</p>}
      <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-2">
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            ref={(el) => {
              optionRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            tabIndex={i === tabStop ? 0 : -1}
            className="answer"
            onClick={() => choose(o.value)}
          >
            <span>{o.label}</span>
            <svg className="tick" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
        <BackLink onBack={onBack} />
        <button type="button" className="btn btn-secondary !w-auto" disabled={value === null} onClick={onNext}>
          {t("question.next")}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 1 · Welcome */

export function Welcome({
  headingRef,
  locale,
  notFound,
  inProgress,
  hasResult,
  onStart,
  onResume,
  onSeeResult,
}: {
  headingRef: HeadingRef;
  locale: Locale;
  notFound: boolean;
  inProgress: boolean;
  hasResult: boolean;
  onStart: () => void;
  onResume: () => void;
  onSeeResult: () => void;
}) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      {notFound && (
        <p role="status" className="card px-4 py-3 text-sm">
          {t("notFound")}
        </p>
      )}
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t("welcome.title")}
      </h1>
      <p className="text-lg">{t("welcome.lead")}</p>
      <p className="t-label">{t("welcome.time")}</p>
      <div className="flex flex-col items-center gap-3 md:items-start">
        {inProgress ? (
          confirming ? (
            // Starting again removes her answers, so it is never one stray tap away.
            <div className="card w-full space-y-3 px-4 py-4" role="alertdialog" aria-labelledby="restart-q">
              <p id="restart-q">{t(hasResult ? "welcome.restartConfirmKept" : "welcome.restartConfirm")}</p>
              <div className="flex flex-col items-center gap-2 md:flex-row">
                <button type="button" className="btn btn-primary" onClick={() => setConfirming(false)} autoFocus>
                  {t("welcome.restartNo")}
                </button>
                <button type="button" className="link min-h-11" onClick={onStart}>
                  {t("welcome.restartYes")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={onResume}>
                {t("welcome.resume")}
              </button>
              <button type="button" className="link min-h-11" onClick={() => setConfirming(true)}>
                {t("welcome.restart")}
              </button>
              {hasResult && (
                <button type="button" className="link min-h-11" onClick={onSeeResult}>
                  {t("welcome.seeResult")}
                </button>
              )}
            </>
          )
        ) : hasResult ? (
          <>
            <button type="button" className="btn btn-primary" onClick={onSeeResult}>
              {t("welcome.seeResult")}
            </button>
            <button type="button" className="link min-h-11" onClick={onStart}>
              {t("welcome.retake")}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {t("welcome.start")}
          </button>
        )}
      </div>
      <div className="card mt-auto space-y-2 px-4 py-4">
        <Disclaimer />
        <p className="t-helper">{t("welcome.adults")}</p>
        <p className="t-helper">
          <a href={PATHS[locale].privacy} className="link">
            {t("welcome.privacy")}
          </a>
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------- 2 · About you (Part A, C1–C6) */

export function About({
  headingRef,
  pos,
  context,
  note,
  onChoose,
  onNote,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  pos: number;
  context: Context;
  note: { text: string; consent: boolean };
  onChoose: <K extends keyof Context>(key: K, value: Context[K]) => void;
  onNote: (note: { text: string; consent: boolean }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();

  // Enter continues from the intro (buttons handle their own Enter).
  useEffect(() => {
    if (pos !== 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
      e.preventDefault();
      onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (pos === 0) {
    return (
      <section className="flex flex-1 flex-col gap-6 pt-8">
        <p className="t-label">{t("about.label")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
          {t("about.title")}
        </h1>
        <p className="text-lg">{t("about.lead")}</p>
        <div className="mt-auto flex flex-col-reverse items-center gap-4 pt-8 md:flex-row md:justify-between">
          <BackLink onBack={onBack} />
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {t("divider.continue")}
          </button>
        </div>
      </section>
    );
  }

  const progress = <Progress n={pos} total={6} label={t("question.progressLabel", { n: pos, total: 6 })} />;
  const common = { headingRef, label: t("about.label"), progress, onNext, onBack };
  const levels = [0, 1, 2, 3, 4] as const;

  if (pos === 1)
    return <Choices {...common} headingId="c1" title={t("c1.q")} value={context.stage}
      options={STAGES.map((v) => ({ value: v, label: t(`c1.${v}`) }))} onChoose={(v) => onChoose("stage", v)} />;
  if (pos === 2)
    return <Choices {...common} headingId="c2" title={t("c2.q")} value={context.caring}
      options={CARING.map((v) => ({ value: v, label: t(`c2.${v}`) }))} onChoose={(v) => onChoose("caring", v)} />;
  if (pos === 3)
    return <Choices {...common} headingId="c3" title={t("c3.q")} value={context.support}
      options={levels.map((v) => ({ value: v, label: t(`c3.${v}`) }))} onChoose={(v) => onChoose("support", v)} />;
  if (pos === 4)
    return <Choices<number | "na"> {...common} headingId="c4" title={t("c4.q")} value={context.flex}
      options={[...levels.map((v) => ({ value: v as number | "na", label: t(`c4.${v}`) })), { value: "na", label: t("c4.na") }]}
      onChoose={(v) => onChoose("flex", v as Context["flex"])} />;
  if (pos === 5)
    return <Choices {...common} headingId="c5" title={t("c5.q")} value={context.treatment}
      options={TREATMENT.map((v) => ({ value: v, label: t(`c5.${v}`) }))} onChoose={(v) => onChoose("treatment", v)} />;

  // C6: her own words. Optional, with its own consent, unticked by default.
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <div className="flex items-center justify-between gap-4">
        <span className="t-label">{t("about.label")}</span>
        {progress}
      </div>
      <h1 ref={headingRef} tabIndex={-1} id="c6" className="t-question outline-none">
        {t("c6.q")}
      </h1>
      <p className="t-helper -mt-2" id="c6-hint">
        {t("c6.hint")}
      </p>
      <textarea
        aria-labelledby="c6"
        aria-describedby="c6-hint c6-local"
        rows={4}
        maxLength={2000}
        value={note.text}
        onChange={(e) => onNote({ ...note, text: e.target.value })}
        className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
      />
      <label className="check">
        <input type="checkbox" checked={note.consent} onChange={(e) => onNote({ ...note, consent: e.target.checked })} />
        <span>{t("c6.consent")}</span>
      </label>
      <p className="t-helper" id="c6-local">
        {t("c6.local")}
      </p>
      <div className="mt-auto flex flex-col-reverse items-center gap-4 pt-6 md:flex-row md:justify-between">
        <BackLink onBack={onBack} />
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {t("about.continue")}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------ 3a · Pillar divider (full screen) */

export function Divider({
  headingRef,
  pillarIndex,
  onContinue,
  onBack,
}: {
  headingRef: HeadingRef;
  pillarIndex: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const pillar = PILLARS[pillarIndex];

  // Enter continues from anywhere on the divider (buttons handle their own Enter).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
      e.preventDefault();
      onContinue();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="flex flex-1 flex-col gap-6 pt-8">
      <div>
        <StepChip step={STEP_OF[pillar]} />
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t(`pillar.${pillar}`)}
      </h1>
      <p className="text-lg">{t(`divider.${pillar}.title`)}</p>
      <p>{t(`divider.${pillar}.line`)}</p>
      <div className="mt-auto flex flex-col-reverse items-center gap-4 pt-8 md:flex-row md:justify-between">
        <BackLink onBack={onBack} />
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          {t("divider.continue")}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- 3b · A statement */

export function Question({
  headingRef,
  index,
  value,
  onAnswer,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  index: number;
  value: Answer | null;
  onAnswer: (a: Answer) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const n = index + 1;
  return (
    <Choices<Answer>
      headingRef={headingRef}
      headingId={`q${n}`}
      title={t(`q${n}`)}
      label={t(`pillar.${pillarOfQuestion(index)}`)}
      progress={<Progress n={n} total={QUESTION_COUNT} label={t("question.progressLabel", { n, total: QUESTION_COUNT })} />}
      hint={t("question.hint")}
      options={([0, 1, 2, 3, 4] as Answer[]).map((a) => ({ value: a, label: t(`scale.${a}`) }))}
      value={value}
      onChoose={onAnswer}
      onNext={onNext}
      onBack={onBack}
    />
  );
}

/* --------------------------------------------------------------- 4 · Check-in */

const CHECKS = ["bleeding", "weight", "bowel", "pain", "tired", "mood"] as const;

export function CheckIn({
  headingRef,
  onContinue,
  onBack,
}: {
  headingRef: HeadingRef;
  onContinue: (flagged: boolean, mood: boolean) => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  // Ticks live only on this screen. Only "anything ticked?" is saved (spec §6).
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (key === "none") return new Set(["none"]);
      else {
        next.delete("none");
        next.add(key);
      }
      return next;
    });
  }

  const flagged = CHECKS.some((k) => ticked.has(k));
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t("checkin.title")}
      </h1>
      <p>{t("checkin.intro")}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="t-helper mb-2">{t("checkin.optional")}</legend>
        {[...CHECKS, "none" as const].map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={ticked.has(k)} onChange={() => toggle(k)} />
            <span>{t(`checkin.${k}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-auto flex flex-col-reverse items-center gap-4 pt-6 md:flex-row md:justify-between">
        <BackLink onBack={onBack} />
        <button type="button" className="btn btn-primary" onClick={() => onContinue(flagged, ticked.has("mood"))}>
          {t("checkin.continue")}
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 5 · Your Map */

/** Lines that write the result for her real week (spec v2 Part A). */
function contextLines(r: MapResult): string[] {
  const keys: string[] = [];
  if (r.context_treatment === "yes") keys.push("treatment");
  if (r.context_treatment === "na") keys.push("treatmentNa");
  if (r.context_caring && !["none", "na"].includes(r.context_caring)) keys.push("caring");
  if (r.context_support !== null && r.context_support <= 1) keys.push("support");
  if (typeof r.context_flex === "number" && r.context_flex <= 1) keys.push("flex");
  return keys;
}

export function Result({
  headingRef,
  locale,
  result,
  moodTicked,
  animate,
  onContinue,
  onRetake,
}: {
  headingRef: HeadingRef;
  locale: Locale;
  result: MapResult;
  moodTicked: boolean;
  animate: boolean;
  onContinue: () => void;
  onRetake: () => void;
}) {
  const t = useTranslations();
  const scores = scoresOf(result);
  const focus = result.suggested_focus;
  const [selected, setSelected] = useState<Pillar | null>(null);
  const name = (p: Pillar) => t(`pillar.${p}`);
  const lines = contextLines(result);

  return (
    <section className="flex flex-col gap-6 pt-2">
      {result.flagged && (
        // A calm panel above her result: no warning colour, no alarm icon, never blocking.
        <div className="card border-l-4 !border-l-attention px-4 py-4" role="note">
          <p>{t("result.flagged")}</p>
          {moodTicked && <p className="mt-2">{t("result.flaggedMood")}</p>}
        </div>
      )}

      <div className="card-result flex flex-col gap-6 px-4 py-6 md:px-8">
        <div>
          <p className="t-label tnum">{t("result.date", { date: formatDate(result.completed_at, locale) })}</p>
          <h1 ref={headingRef} tabIndex={-1} className="t-title mt-1 outline-none">
            {t("result.title")}
          </h1>
        </div>

        <div className="-mx-3 md:mx-0">
          <Wheel scores={scores} animate={animate} selected={selected} onSelect={setSelected} />
        </div>
        <p className="t-helper no-print -mt-2 text-center" aria-live="polite">
          {selected
            ? t("result.detail", {
                pillar: name(selected),
                score: scores[selected],
                band: t(`band.${bandOf(scores[selected])}`) + ".",
                step: t(`step.${STEP_OF[selected]}`),
              })
            : t("result.tapHint")}
        </p>

        <div className="flex flex-col gap-3 border-t border-line pt-6">
          <h2 className="t-pillar !text-2xl">{t("result.focus", { pillar: name(focus) })}</h2>
          <div>
            <StepChip step={result.suggested_focus_step} />
          </div>
          <p>{t("result.focusStep", { pillar: name(focus), step: t(`step.${result.suggested_focus_step}`) })}</p>
          <p>{t(`result.startClaim.${focus}`)}</p>
          <p className="rounded-[12px] bg-plum-100 px-4 py-3">{t("result.decide")}</p>
        </div>

        {lines.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="t-label">{t("result.ctxLabel")}</h2>
            {lines.map((k) => (
              <p key={k}>{t(`result.ctx.${k}`)}</p>
            ))}
          </div>
        )}

        <div className="rounded-[12px] bg-rose-100 px-4 py-4">
          <h2 className="t-label">{t("result.actionLabel")}</h2>
          <p className="mt-2">{t(`result.action.${focus}`)}</p>
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-6">
          <h2 className="t-label">{t("result.allAreas")}</h2>
          <Bars scores={scores} priority={focus} />
          <details className="mt-2">
            <summary className="link inline-flex min-h-11 items-center">{t("result.seeNumbers")}</summary>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-2">{t("result.col.area")}</th>
                  <th scope="col" className="py-2 pr-2">{t("result.col.step")}</th>
                  <th scope="col" className="py-2 text-right">{t("result.col.score")}</th>
                </tr>
              </thead>
              <tbody>
                {PILLARS.map((p) => (
                  <tr key={p} className="border-b border-line">
                    <th scope="row" className="py-2 pr-2 font-normal">{name(p)}</th>
                    <td className="py-2 pr-2">{t(`step.${STEP_OF[p]}`)}</td>
                    <td className="tnum py-2 text-right font-bold">{scores[p]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="t-helper">{t("result.reminder")}</p>
          <Disclaimer />
        </div>
      </div>

      <div className="no-print flex flex-col items-center gap-3 md:items-start">
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          {t("result.continue")}
        </button>
        <button type="button" className="link min-h-11" onClick={onRetake}>
          {t("result.retake")}
        </button>
        <p className="t-helper">{t("result.localNote")}</p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- 6 · What next */

export function WhatNext({ headingRef, result, onBack }: { headingRef: HeadingRef; result: MapResult; onBack: () => void }) {
  const t = useTranslations();
  const pillar = t(`pillar.${result.suggested_focus}`);
  return (
    <section className="flex flex-1 flex-col gap-6 pt-6">
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t("next.title")}
      </h1>
      <p className="text-lg">{t("next.lead", { pillar })}</p>
      <div className="flex flex-col items-center gap-3 md:items-start">
        <a href={PATHWAY_URL[result.suggested_focus]} className="btn btn-primary">
          {t("next.primary", { pillar })}
        </a>
        <a href={PROGRAMME_URL} className="link inline-flex min-h-11 items-center">
          {t("next.secondary")}
        </a>
      </div>
      <p className="t-helper">{t("next.emailSoon")}</p>
      <div className="mt-auto pt-6">
        <button type="button" className="link inline-flex min-h-11 items-center" onClick={onBack}>
          <span aria-hidden="true">←&nbsp;</span>
          {t("next.back")}
        </button>
      </div>
    </section>
  );
}
