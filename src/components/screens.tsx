"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Bars } from "@/components/Bars";
import { Wheel } from "@/components/Wheel";
import { PrintAnswers } from "@/components/PrintAnswers";
import { conclusionBlocks, type Personal } from "@/lib/conclusion";
import { joinFragments, quoteReady } from "@/lib/sentences";
import { PATHS, formatDate, type Locale } from "@/lib/i18n";
import {
  AGE_BANDS,
  CARING,
  DURATIONS,
  LIFE_STAGES,
  MAX_TOPICS,
  OBSTACLES,
  PATHS_ALL,
  PILLARS,
  QUESTION_COUNT,
  READINESS,
  STEPS,
  STEP_OF,
  TOPICS,
  TREATMENT,
  TRIED,
  bandOf,
  pillarOfQuestion,
  scoresOf,
  triedNothing,
  type Answer,
  type Answers,
  type Context,
  type Journey,
  type MapResult,
  type Path,
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

function ScreenHead({ label, progress }: { label: string; progress?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="t-label">{label}</span>
      {progress}
    </div>
  );
}

function Nav({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-auto flex flex-col-reverse items-center gap-4 pt-6 md:flex-row md:justify-between">
      <BackLink onBack={onBack} />
      {children}
    </div>
  );
}

/* ------------------------------------------------ The answer control (spec §10) */

type Option<V> = { value: V; label: string };

/**
 * Full-width stacked options as one radio group: one Tab stop, arrows move, number keys
 * select, a tap advances after 250 ms, Enter advances once answered.
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
  progress?: React.ReactNode;
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

  const tabStop = selectedIndex === -1 ? 0 : selectedIndex; // roving tab stop
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <ScreenHead label={label} progress={progress} />
      <h1 ref={headingRef} tabIndex={-1} id={headingId} className="t-question outline-none">
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
      <Nav onBack={onBack}>
        <button type="button" className="btn btn-secondary !w-auto" disabled={value === null} onClick={onNext}>
          {t("question.next")}
          <span aria-hidden="true">→</span>
        </button>
      </Nav>
    </section>
  );
}

/** Pick several (J1, J2) or at most `max` (C7 takes two topics). */
function MultiChoice<V extends string>({
  headingRef,
  headingId,
  title,
  label,
  progress,
  hint,
  options,
  values,
  max,
  maxNote,
  exclusive,
  onChange,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  headingId: string;
  title: string;
  label: string;
  progress?: React.ReactNode;
  hint?: string;
  options: Option<V>[];
  values: V[];
  max?: number;
  maxNote?: string;
  /** An option that cannot be combined with the others, e.g. "nothing yet". */
  exclusive?: V;
  onChange: (values: V[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const full = max !== undefined && values.length >= max;

  function toggle(v: V) {
    if (values.includes(v)) return onChange(values.filter((x) => x !== v));
    if (exclusive && v === exclusive) return onChange([v]);
    const kept = exclusive ? values.filter((x) => x !== exclusive) : values;
    if (max !== undefined && kept.length >= max) return;
    onChange([...kept, v]);
  }

  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <ScreenHead label={label} progress={progress} />
      <h1 ref={headingRef} tabIndex={-1} id={headingId} className="t-question outline-none">
        {title}
      </h1>
      {hint && <p className="t-helper -mt-2">{hint}</p>}
      <fieldset className="flex flex-col gap-2" aria-describedby={maxNote && full ? `${headingId}-max` : undefined}>
        <legend className="sr-only">{title}</legend>
        {options.map((o) => (
          <label key={o.value} className={"check" + (full && !values.includes(o.value) ? " opacity-60" : "")}>
            <input
              type="checkbox"
              checked={values.includes(o.value)}
              disabled={full && !values.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {maxNote && full && (
        <p className="t-helper" id={`${headingId}-max`} role="status">
          {maxNote}
        </p>
      )}
      <Nav onBack={onBack}>
        <button type="button" className="btn btn-secondary !w-auto" disabled={values.length === 0} onClick={onNext}>
          {t("question.next")}
          <span aria-hidden="true">→</span>
        </button>
      </Nav>
    </section>
  );
}

/** Her own words, or her name: optional, kept on this device only. */
function TextAnswer({
  headingRef,
  headingId,
  title,
  label,
  progress,
  hint,
  value,
  onChange,
  onNext,
  onBack,
  rows = 4,
  maxLength = 2000,
  footer,
  nextLabel,
}: {
  headingRef: HeadingRef;
  headingId: string;
  title: string;
  label: string;
  progress?: React.ReactNode;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  rows?: number;
  maxLength?: number;
  footer?: React.ReactNode;
  nextLabel?: string;
}) {
  const t = useTranslations();
  return (
    <section className="flex flex-1 flex-col gap-5 pt-2">
      <ScreenHead label={label} progress={progress} />
      <h1 ref={headingRef} tabIndex={-1} id={headingId} className="t-question outline-none">
        {title}
      </h1>
      {hint && (
        <p className="t-helper -mt-2" id={`${headingId}-hint`}>
          {hint}
        </p>
      )}
      {rows === 1 ? (
        <input
          type="text"
          aria-labelledby={headingId}
          aria-describedby={hint ? `${headingId}-hint` : undefined}
          autoComplete="given-name"
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onNext()}
          className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
        />
      ) : (
        <textarea
          aria-labelledby={headingId}
          aria-describedby={hint ? `${headingId}-hint` : undefined}
          rows={rows}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
        />
      )}
      {footer}
      <Nav onBack={onBack}>
        <button type="button" className="btn btn-primary !w-auto" onClick={onNext}>
          {nextLabel ?? t("question.next")}
        </button>
      </Nav>
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
      <p className="text-lg">{t("welcome.p1")}</p>
      <p>{t("welcome.p2")}</p>
      <p>{t("welcome.p3")}</p>
      <div className="card px-4 py-4">
        <p>{t("welcome.p4")}</p>
        <p className="t-script mt-2 text-right text-rose-700">{t("welcome.signature")}</p>
      </div>
      <p className="t-label">{t("welcome.time")}</p>
      <div className="flex flex-col items-center gap-3 md:items-start">
        {inProgress ? (
          confirming ? (
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

/* ------------------------------------------------- 2 · About you (Part A, C0–C8) */

export function About({
  headingRef,
  pos,
  context,
  personal,
  onChoose,
  onName,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  pos: number;
  context: Context;
  personal: Personal;
  onChoose: <K extends keyof Context>(key: K, value: Context[K]) => void;
  onName: (name: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();

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
        <Nav onBack={onBack}>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {t("divider.continue")}
          </button>
        </Nav>
      </section>
    );
  }

  const progress = <Progress n={pos} total={9} label={t("question.progressLabel", { n: pos, total: 9 })} />;
  const common = { headingRef, label: t("about.label"), progress, onNext, onBack };
  const levels = [0, 1, 2, 3, 4] as const;
  // next-intl types message keys literally; these are built from the code lists above.
  const tx = t as unknown as (key: string) => string;
  const opts = <T extends string>(list: readonly T[], prefix: string) =>
    list.map((v) => ({ value: v, label: tx(`${prefix}.${v}`) }));

  switch (pos) {
    case 1:
      return (
        <TextAnswer {...common} headingId="c0" title={t("c0.q")} hint={t("c0.hint")} rows={1} maxLength={60}
          value={personal.name} onChange={onName} />
      );
    case 2:
      return <Choices {...common} headingId="c1" title={t("c1.q")} value={context.age}
        options={opts(AGE_BANDS, "c1")} onChoose={(v) => onChoose("age", v)} />;
    case 3:
      return <Choices {...common} headingId="c2" title={t("c2.q")} value={context.stage}
        options={opts(LIFE_STAGES, "c2")} onChoose={(v) => onChoose("stage", v)} />;
    case 4:
      return <Choices {...common} headingId="c3" title={t("c3.q")} value={context.caring}
        options={opts(CARING, "c3")} onChoose={(v) => onChoose("caring", v)} />;
    case 5:
      return <Choices {...common} headingId="c4" title={t("c4.q")} value={context.support}
        options={levels.map((v) => ({ value: v, label: t(`c4.${v}`) }))} onChoose={(v) => onChoose("support", v)} />;
    case 6:
      return <Choices<number | "na"> {...common} headingId="c5" title={t("c5.q")} value={context.flex}
        options={[...levels.map((v) => ({ value: v as number | "na", label: t(`c5.${v}`) })), { value: "na", label: t("c5.na") }]}
        onChoose={(v) => onChoose("flex", v as Context["flex"])} />;
    case 7:
      return <Choices {...common} headingId="c6" title={t("c6.q")} value={context.treatment}
        options={opts(TREATMENT, "c6")} onChoose={(v) => onChoose("treatment", v)} />;
    case 8:
      return (
        <MultiChoice {...common} headingId="c7" title={t("c7.q")} hint={t("c7.hint")} maxNote={t("c7.max")}
          max={MAX_TOPICS} options={opts(TOPICS, "c7")} values={context.topics}
          onChange={(v) => onChoose("topics", v)} />
      );
    default:
      return <Choices {...common} headingId="c8" title={t("c8.q")} value={context.duration}
        options={opts(DURATIONS, "c8")} onChoose={(v) => onChoose("duration", v)} />;
  }
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
      <Nav onBack={onBack}>
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          {t("divider.continue")}
        </button>
      </Nav>
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

/* --------------------------------------------- 4 · Your journey (Part C, J1–J5) */

export function JourneyScreen({
  headingRef,
  pos,
  journey,
  personal,
  onChange,
  onPersonal,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  pos: number;
  journey: Journey;
  personal: Personal;
  onChange: <K extends keyof Journey>(key: K, value: Journey[K]) => void;
  onPersonal: (p: Personal) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();

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
        <p className="t-label">{t("journey.label")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
          {t("journey.title")}
        </h1>
        <p className="text-lg">{t("journey.lead")}</p>
        <Nav onBack={onBack}>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {t("divider.continue")}
          </button>
        </Nav>
      </section>
    );
  }

  // When "nothing yet" skips J2, she sees four questions, not five, so the count says four.
  const skipsJ2 = triedNothing(journey);
  const total = skipsJ2 ? 4 : 5;
  const shown = skipsJ2 && pos >= 3 ? pos - 1 : pos;
  const progress = <Progress n={shown} total={total} label={t("question.progressLabel", { n: shown, total })} />;
  const common = { headingRef, label: t("journey.label"), progress, onNext, onBack };
  const consent = (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={personal.shareConsent}
          onChange={(e) => onPersonal({ ...personal, shareConsent: e.target.checked })}
        />
        <span>{t("share.consent")}</span>
      </label>
      <p className="t-helper">{t("share.local")}</p>
    </>
  );

  switch (pos) {
    case 1:
      return (
        <MultiChoice {...common} headingId="j1" title={t("j1.q")} hint={t("j1.hint")} exclusive="nothing"
          options={TRIED.map((v) => ({ value: v, label: t(`j1.${v}`) }))} values={journey.tried}
          onChange={(v) => onChange("tried", v)} />
      );
    case 2:
      return (
        <MultiChoice {...common} headingId="j2" title={t("j2.q")} hint={t("j1.hint")}
          options={OBSTACLES.map((v) => ({ value: v, label: t(`j2.${v}`) }))} values={journey.obstacles}
          onChange={(v) => onChange("obstacles", v)} />
      );
    case 3:
      return (
        <TextAnswer {...common} headingId="j3" title={t("j3.q")} hint={t("j3.hint")}
          value={personal.vision} onChange={(v) => onPersonal({ ...personal, vision: v })} footer={consent} />
      );
    case 4:
      return <Choices {...common} headingId="j4" title={t("j4.q")} value={journey.readiness}
        options={READINESS.map((v) => ({ value: v, label: t(`j4.${v}`) }))} onChoose={(v) => onChange("readiness", v)} />;
    default:
      return (
        <TextAnswer {...common} headingId="j5" title={t("j5.q")} hint={t("j5.hint")} rows={3}
          value={personal.question} onChange={(v) => onPersonal({ ...personal, question: v })}
          footer={consent} nextLabel={t("about.continue")} />
      );
  }
}

/* --------------------------------------------------------------- 5 · Check-in */

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
      <Nav onBack={onBack}>
        <button type="button" className="btn btn-primary" onClick={() => onContinue(flagged, ticked.has("mood"))}>
          {t("checkin.continue")}
        </button>
      </Nav>
    </section>
  );
}

/* ------------------------------------------- 6 · Your Map and the conclusion (§3) */

function WorkCard({ pillar }: { pillar: Pillar }) {
  const t = useTranslations();
  return (
    <div className="card px-4 py-4">
      <h3 className="t-pillar">{t(`pillar.${pillar}`)}</h3>
      <dl className="mt-2 space-y-2">
        {(["looksLike", "weDo", "towards"] as const).map((field) => (
          <div key={field}>
            <dt className="t-label">{t(`result.col.${field}`)}</dt>
            <dd>{t(`work.${pillar}.${field}`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Result({
  headingRef,
  locale,
  result,
  personal,
  answers,
  context,
  journey,
  moodTicked,
  animate,
  onContinue,
  onRetake,
}: {
  headingRef: HeadingRef;
  locale: Locale;
  result: MapResult;
  personal: Personal;
  answers: Answers;
  context: Context;
  journey: Journey;
  moodTicked: boolean;
  animate: boolean;
  onContinue: () => void;
  onRetake: () => void;
}) {
  const t = useTranslations();
  const scores = scoresOf(result);
  const [selected, setSelected] = useState<Pillar | null>(null);
  const name = (p: Pillar) => t(`pillar.${p}`);
  const blocks = conclusionBlocks(result, personal);
  const list = (items: string[]) => joinFragments(locale, items);
  // Answers have their own sentence-fragment wording, so a sentence never swallows a
  // menu label like "I just want to feel better overall" (review 3, finding 2).
  const tx = t as unknown as (key: string) => string;
  const fragments = (prefix: string, codes: string[]) => list(codes.map((code) => tx(`${prefix}.${code}`)));

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
        {blocks.map((block) => {
          switch (block.id) {
            case "map":
              return (
                <div key="map" className="flex flex-col gap-4">
                  <div>
                    <p className="t-label tnum">{t("result.date", { date: formatDate(result.completed_at, locale) })}</p>
                    <h1 ref={headingRef} tabIndex={-1} className="t-title mt-1 outline-none">
                      {block.name ? t("result.hello", { name: block.name }) : t("result.title")}
                    </h1>
                  </div>
                  <div className="-mx-4 md:mx-0">
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
                  <h2 className="t-label">{t("result.allAreas")}</h2>
                  <Bars scores={scores} focus={[result.focus_pillar, result.second_pillar]} />
                  <details>
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
              );
            case "focus":
              return (
                <div key="focus" className="flex flex-col gap-3 border-t border-line pt-6">
                  <h2 className="t-pillar !text-2xl">
                    {t(block.strong ? "result.focusAllStrong" : "result.focus", { a: name(block.a), b: name(block.b) })}
                  </h2>
                  {[block.a, block.b].map((p) => (
                    <p key={p}>
                      <strong className="font-normal text-plum-700">{name(p)}:</strong> {t(`band.${bandOf(scores[p])}`)}.
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([STEP_OF[block.a], STEP_OF[block.b]])].map((step) => (
                      <StepChip key={step} step={step} />
                    ))}
                  </div>
                </div>
              );
            case "allStrong":
              return <p key="allStrong">{t("result.allStrong")}</p>;
            case "connection":
              return (
                <p key="connection">
                  {t("result.connection", {
                    topics: fragments("topicIn", block.topics),
                    topic: tx(`topicIn.${block.topics[0]}`),
                    a: name(block.a),
                    b: name(block.b),
                    phrase: t(`phrase.${block.a}`),
                  })}
                </p>
              );
            case "notYou":
              return (
                <p key="notYou">
                  {block.nothingTried || block.tried.length === 0
                    ? t("result.notYouNothing")
                    : t("result.notYou", {
                        tried: fragments("triedIn", block.tried),
                        obstacles: fragments("obstacleIn", block.obstacles),
                      })}
                </p>
              );
            case "howWeWork":
              return (
                <div key="howWeWork" className="flex flex-col gap-3 border-t border-line pt-6">
                  <h2 className="t-label">{t("result.howWeWork")}</h2>
                  {block.pillars.map((p) => (
                    <WorkCard key={p} pillar={p} />
                  ))}
                </div>
              );
            case "begin":
              return (
                <div key="begin" className="flex flex-col gap-2">
                  <p>{t("result.begin", { a: name(block.a) })}</p>
                  {block.focusIsClaim && <p>{t("result.beginIsClaim")}</p>}
                  {block.inTreatment && <p>{t("result.beginTreatment")}</p>}
                </div>
              );
            case "herWords":
              return (
                <div key="herWords" className="flex flex-col gap-2 rounded-[12px] bg-plum-100 px-4 py-4">
                  {block.vision && <p>{t("result.herWords", { vision: quoteReady(block.vision) })}</p>}
                  {block.duration && (
                    <p>{t("result.herWordsDuration", { duration: tx(`durationFor.${block.duration}`) })}</p>
                  )}
                </div>
              );
            default:
              return (
                <div key="thisWeek" className="rounded-[12px] bg-rose-100 px-4 py-4">
                  <h2 className="t-label">{t("result.actionLabel")}</h2>
                  <p className="mt-2">{t(`practice.${block.a}`)}</p>
                </div>
              );
          }
        })}

        <div className="space-y-2 border-t border-line pt-4">
          <p>{t("result.decide")}</p>
          <p className="t-helper">{t("result.reminder")}</p>
          <Disclaimer />
        </div>
      </div>

      <PrintAnswers answers={answers} context={context} journey={journey} flagged={result.flagged} />

      <div className="no-print flex flex-col items-center gap-3 md:items-start">
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          {t("result.continue")}
        </button>
        <PrintButtons />
        <p className="t-helper">{t("print.hint")}</p>
        <button type="button" className="link min-h-11" onClick={onRetake}>
          {t("result.retake")}
        </button>
        <p className="t-helper">{t("result.localNote")}</p>
      </div>
    </section>
  );
}

/** "Print my result" and "Print my full Map" (spec v4 §12). The full one adds her answers
 * to the page for the duration of the print, through a class on <html>. */
export function PrintButtons() {
  const t = useTranslations();

  useEffect(() => {
    const clear = () => document.documentElement.classList.remove("printing-full");
    window.addEventListener("afterprint", clear);
    return () => {
      window.removeEventListener("afterprint", clear);
      clear();
    };
  }, []);

  function print(full: boolean) {
    document.documentElement.classList.toggle("printing-full", full);
    // One frame, so the answers are on the page before the print dialog reads it.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 md:flex-row md:items-start">
      <button type="button" className="btn btn-secondary" onClick={() => print(false)}>
        {t("print.result")}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => print(true)}>
        {t("print.full")}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- 7 · The paths */

export function Paths({ headingRef, result, onBack }: { headingRef: HeadingRef; result: MapResult; onBack: () => void }) {
  const t = useTranslations();
  const rows = ["promise", "length", "covers", "continues", "forYou"] as const;
  return (
    <section className="flex flex-1 flex-col gap-6 pt-2">
      <h1 ref={headingRef} tabIndex={-1} className="t-title outline-none">
        {t("paths.title")}
      </h1>
      <p className="text-lg">{t("paths.lead")}</p>
      <div className="flex flex-col gap-4">
        {PATHS_ALL.map((path: Path) => {
          const suggested = path === result.recommended_path;
          return (
            <article
              key={path}
              className={"card px-4 py-4" + (suggested ? " !border-2 !border-rose-600 bg-rose-100" : "")}
              aria-labelledby={`path-${path}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`path-${path}`} className="t-pillar !text-xl">
                  {t(`path.${path}.name`)}
                </h2>
                {suggested && <span className="chip text-ink">{t("paths.recommended")}</span>}
              </div>
              <dl className="mt-2 space-y-2">
                {rows.map((row) => (
                  <div key={row}>
                    <dt className="t-label">{t(`paths.col.${row}`)}</dt>
                    <dd>{t(`path.${path}.${row}`)}</dd>
                  </div>
                ))}
                <div>
                  <dt className="t-label">{t("paths.col.price")}</dt>
                  <dd>{t("paths.priceTbc")}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <p className="card px-4 py-3 text-sm" role="note">
        {t("paths.soon")}
      </p>
      <div className="card px-4 py-4">
        <h2 className="t-pillar !text-xl">{t("paths.keepMap")}</h2>
        <p className="mt-2">{t("paths.keepMapNote")}</p>
      </div>
      <div className="mt-auto pt-6">
        <button type="button" className="link inline-flex min-h-11 items-center" onClick={onBack}>
          <span aria-hidden="true">←&nbsp;</span>
          {t("paths.back")}
        </button>
      </div>
    </section>
  );
}
