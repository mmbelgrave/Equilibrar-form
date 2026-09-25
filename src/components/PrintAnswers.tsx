"use client";

import { useTranslations } from "next-intl";
import { CONTEXT_KEYS, PILLARS, pillarOfQuestion, type Answers, type Context, type Journey } from "@/lib/scoring";

/**
 * Everything she answered, for "Print my full Map" (spec v4 §12). On her own device it is
 * on the page only while that button prints, and it is built from what is stored there: the
 * 24 answers, her context and journey answers. The check-in appears as the one yes/no the
 * app keeps — which boxes she ticked is never stored, so it cannot be printed either.
 *
 * Rê's page renders the same thing from what a woman sent when she shared, where the
 * check-in does not exist at all: `flagged` is null there and the section is left out
 * rather than guessed at.
 */
export function PrintAnswers({
  answers,
  context,
  journey,
  flagged,
  always = false,
  title,
}: {
  answers: Answers;
  context: Context;
  journey: Journey;
  /** null when it was never recorded, which is the case everywhere except her own device. */
  flagged: boolean | null;
  /** True on Rê's page, where this is part of the page rather than something print reveals. */
  always?: boolean;
  /** "As suas respostas" on her own Map; "As respostas dela" on Rê's page. */
  title?: string;
}) {
  const t = useTranslations();
  const tx = t as unknown as (key: string) => string;

  const contextRows = CONTEXT_KEYS.map((key, i) => {
    const value = context[key];
    const question = tx(`c${i + 1}.q`);
    if (key === "topics") return [question, context.topics.map((code) => tx(`c7.${code}`)).join(" · ")] as const;
    if (value === null) return [question, t("print.notAnswered")] as const;
    return [question, tx(`c${i + 1}.${value}`)] as const;
  });

  const journeyRows = [
    [t("j1.q"), journey.tried.map((code) => tx(`j1.${code}`)).join(" · ")],
    [t("j2.q"), journey.obstacles.map((code) => tx(`j2.${code}`)).join(" · ")],
    [t("j4.q"), journey.readiness ? tx(`j4.${journey.readiness}`) : t("print.notAnswered")],
  ] as const;

  return (
    <section className={"print-sheet" + (always ? "" : " print-only")} aria-hidden={always ? undefined : true}>
      <h2 className="t-title">{title ?? t("print.answersTitle")}</h2>

      <h3 className="t-pillar">{t("print.aboutTitle")}</h3>
      <Rows rows={contextRows.filter(([, value]) => value)} />

      {PILLARS.map((pillar) => (
        <div key={pillar} className="avoid-break">
          <h3 className="t-pillar">{t(`pillar.${pillar}`)}</h3>
          <Rows
            rows={answers
              .map((answer, i) => [i, answer] as const)
              .filter(([i]) => pillarOfQuestion(i) === pillar)
              .map(([i, answer]) => [
                `${i + 1}. ${tx(`q${i + 1}`)}`,
                answer === null ? t("print.notAnswered") : tx(`scale.${answer}`),
              ])}
          />
        </div>
      ))}

      <h3 className="t-pillar">{t("print.journeyTitle")}</h3>
      <Rows rows={journeyRows.filter(([, value]) => value)} />

      {flagged !== null && (
        <>
          <h3 className="t-pillar">{t("print.checkinTitle")}</h3>
          <p>{flagged ? t("print.checkinTicked") : t("print.checkinNone")}</p>
        </>
      )}
    </section>
  );
}

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="print-rows">
      {rows.map(([label, value]) => (
        <div key={label} className="avoid-break">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
