"use client";

import { NextIntlClientProvider } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bars } from "@/components/Bars";
import { Header } from "@/components/Header";
import { PrintAnswers } from "@/components/PrintAnswers";
import { Wheel } from "@/components/Wheel";
import { COPY, PILLAR_NAME, hasAnswered, whenWas, type AdminCopy } from "@/lib/adminCopy";
import {
  adminLocale,
  db,
  deleteMap,
  enabled as dbEnabled,
  isAdmin,
  listMaps,
  overview,
  pillarsAnswered,
  setStatus,
  statusOf,
  toCsv,
  type AdminMap,
  type MapStatus,
} from "@/lib/db";
import { MESSAGES, PATHS, formatDate, type Locale } from "@/lib/i18n";
import {
  PILLARS,
  focusPillars,
  type Answer,
  type Answers,
  type Context,
  type Journey,
  type Pillar,
  type Scores,
} from "@/lib/scoring";

/**
 * Rê's admin view (spec v4 §12). It is in the same app, protected by the database's own
 * rules: even if someone opens this page, they see nothing unless their account is on the
 * admins list. Sign-in is a link sent to her email — no password to lose.
 *
 * The page answers one question first: who did the Map, and when. Everything else is a
 * click away. It used to open on four rows of filter chips and a wall of figures above a
 * list of every Map ever started, most of them empty, which buried the handful of women
 * actually worth a reply.
 */

/** A Map with the things that depend on the clock worked out when the list is read,
 * so nothing reads the time while the page is drawing. */
type Row = AdminMap & { rowStatus: MapStatus; late: boolean; sharedDays: number | null };

const LANG_KEY = "eq.admin.lang";

/** The coded answers on a row, in the shape the printed Map is built from. */
const asContext = (m: AdminMap): Context => ({
  age: m.age_band as Context["age"],
  stage: m.life_stage as Context["stage"],
  caring: m.caring_for as Context["caring"],
  support: m.support_home as Context["support"],
  flex: (m.work_flex === null ? null : m.work_flex === "na" ? "na" : Number(m.work_flex)) as Context["flex"],
  treatment: m.in_treatment as Context["treatment"],
  topics: (m.focus_topics ?? []) as Context["topics"],
  duration: m.duration as Context["duration"],
});

const asJourney = (m: AdminMap): Journey => ({
  tried: (m.tried ?? []) as Journey["tried"],
  obstacles: (m.obstacles ?? []) as Journey["obstacles"],
  readiness: m.readiness as Journey["readiness"],
});

/**
 * Why a shared Map has no answers to show. Nothing stored tells "she did not tick the box"
 * apart from "this Map is older than the box", so one sentence covers both rather than
 * picking one and being wrong half the time. A set that arrived and failed the 0–4 check is
 * a different thing and worth saying separately, because it is a bug.
 */
const missingAnswers = (m: AdminMap, t: AdminCopy): string =>
  m.contact?.answers == null ? t.noAnswersShared : t.answersBroken;

/** Her 24 answers, if she sent them: 0–4 each, anything else is not a set we can print. */
const answersOf = (m: AdminMap): Answers | null => {
  const raw = m.contact?.answers;
  if (!Array.isArray(raw) || raw.length !== 24) return null;
  return raw.every((a) => Number.isInteger(a) && a >= 0 && a <= 4) ? (raw as Answer[]) : null;
};

export function Admin() {
  const [email, setEmail] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [maps, setMaps] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [lang, setLang] = useState<Locale>("pt");
  const chosenLang = useRef(false);

  // Who is signed in, and stay in step with the sign-in link when she follows it. The
  // session itself lives in this browser's storage and refreshes on its own, so a device
  // that has signed in once opens the page straight away.
  useEffect(() => {
    const supabase = db();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Her own language: what she picked on this device wins, then her row in `admins`.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "pt" || saved === "en") {
        chosenLang.current = true;
        // Read on mount rather than in the initial state: this page is exported as static
        // HTML, so the first render happens at build time where there is no storage, and
        // reading it during render would make the markup and the browser disagree.
        setLang(saved); // eslint-disable-line react-hooks/set-state-in-effect
      }
    } catch {
      // A browser with storage switched off still gets a working page, in Portuguese.
    }
  }, []);

  useEffect(() => {
    if (!email || chosenLang.current) return;
    void adminLocale(email).then((l) => {
      if (l && !chosenLang.current) setLang(l);
    });
  }, [email]);

  const pickLang = (l: Locale) => {
    chosenLang.current = true;
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // Not being able to remember it is a small loss, not a reason to refuse the switch.
    }
  };

  const load = useCallback(async () => {
    if (!email) return;
    const now = new Date();
    setAllowed(await isAdmin());
    const { maps: rows, error: failure } = await listMaps();
    setError(failure);
    setMaps(
      rows.map((map) => ({
        ...map,
        rowStatus: statusOf(map, now),
        // Rê's promise is a reply within 48 hours; later than that shows in the attention colour.
        late: !!map.shared_at && map.status === "open" && now.getTime() - new Date(map.shared_at).getTime() > 48 * 3_600_000,
        sharedDays: map.shared_at ? (now.getTime() - new Date(map.shared_at).getTime()) / 86_400_000 : null,
      })),
    );
  }, [email]);

  useEffect(() => {
    // Reading her Maps from the database is exactly what this page is for.
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const t = COPY[lang];

  if (!dbEnabled) {
    return (
      <Shell lang={lang} onLang={pickLang} t={t}>
        {t.notConfigured}
      </Shell>
    );
  }
  if (!email) return <SignIn lang={lang} onLang={pickLang} t={t} />;

  const all = maps ?? [];
  // Everyone who answered something, newest first; the ones who sent their Map to Rê first
  // of all, because those are the ones waiting on her.
  const answered = all.filter(hasAnswered);
  const empties = all.length - answered.length;
  const people = (showEmpty ? all : answered)
    .slice()
    .sort((a, b) => {
      const weight = (m: Row) => (m.rowStatus === "shared" ? 0 : 1);
      return weight(a) - weight(b) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  return (
    <Shell lang={lang} onLang={pickLang} t={t} onSignOut={() => db()?.auth.signOut()}>
      {error && (
        <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
          {t.failed}
        </p>
      )}
      {allowed === false && !error && (
        <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
          {t.noAccessAccount}
        </p>
      )}

      {open ? (
        <Detail
          // The key rebuilds the panel for each Map. Without it, opening a second Map while
          // the first is still on screen kept the first one's note and status, and saving
          // wrote them onto the second woman's row (review 5, finding 14).
          key={open.id}
          map={open}
          lang={lang}
          t={t}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            await load();
            setOpen(null);
          }}
        />
      ) : (
        <section className="flex flex-col gap-4">
          <div className="no-print flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="t-pillar !text-xl">{t.people}</h2>
            <span className="t-helper">{t.peopleCount(people.length)}</span>
          </div>

          {maps === null ? (
            <p>{t.loading}</p>
          ) : people.length === 0 ? (
            <p>{t.none}</p>
          ) : (
            <ul className="no-print flex flex-col gap-2">
              {people.map((m) => (
                <li key={m.id}>
                  <button type="button" className="card w-full px-4 py-3 text-left" onClick={() => setOpen(m)}>
                    <MapRow map={m} lang={lang} t={t} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {empties > 0 && (
            <p className="no-print t-helper">
              {t.emptyHidden(empties)}{" "}
              <button type="button" className="link" onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty ? t.emptyHide : t.emptyShow}
              </button>
            </p>
          )}

          <div className="no-print flex flex-wrap items-center gap-4 pt-2">
            <button type="button" className="link min-h-11" onClick={() => setShowSummary((v) => !v)}>
              {showSummary ? t.summaryHide : t.summaryShow}
            </button>
            <button type="button" className="link min-h-11" onClick={() => downloadCsv(all)} disabled={!all.length}>
              {t.export}
            </button>
          </div>

          {showSummary && (
            <div className="no-print">
              <Overview sums={overview(all)} lang={lang} t={t} />
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}

function Shell({
  children,
  lang,
  onLang,
  t,
  onSignOut,
}: {
  children: React.ReactNode;
  lang: Locale;
  onLang: (l: Locale) => void;
  t: AdminCopy;
  onSignOut?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // The shared header and the printed answers speak through the message files, so the
  // provider's locale is what puts her questions in her language too.
  return (
    <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="Europe/Lisbon">
      <Header locale={lang} hrefs={{ pt: PATHS.pt.map, en: PATHS.en.map }} variant="compact" />
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 px-5 pt-6 pb-12">
        <div className="no-print flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="t-title">{t.title}</h1>
          <div className="flex items-center gap-3">
            {(["pt", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={"chip " + (lang === l ? "!border-rose-600 bg-rose-100" : "")}
                aria-pressed={lang === l}
                onClick={() => onLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
            {onSignOut &&
              // Signing out costs a new link from her e-mail, so it asks first rather than
              // being one stray tap away.
              (confirming ? (
                <>
                  <span className="t-helper">{t.signOutConfirm}</span>
                  <button type="button" className="link min-h-11 text-attention" onClick={onSignOut}>
                    {t.signOutYes}
                  </button>
                  <button type="button" className="link min-h-11" onClick={() => setConfirming(false)}>
                    {t.signOutNo}
                  </button>
                </>
              ) : (
                <button type="button" className="link min-h-11" onClick={() => setConfirming(true)}>
                  {t.signOut}
                </button>
              ))}
          </div>
        </div>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

function SignIn({ lang, onLang, t }: { lang: Locale; onLang: (l: Locale) => void; t: AdminCopy }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = db();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Anyone can open this page, so it must not also be a sign-up box: without this, any
      // address typed here would get an account and an email out of Rê's project
      // (review 5, finding 7).
      options: {
        shouldCreateUser: false,
        emailRedirectTo: typeof window === "undefined" ? undefined : window.location.href,
      },
    });
    if (error) setError(t.noAccess);
    else setSent(true);
  }

  return (
    <Shell lang={lang} onLang={onLang} t={t}>
      <form className="card flex max-w-[420px] flex-col gap-3 px-4 py-4" onSubmit={submit}>
        <h2 className="t-pillar !text-xl">{t.signIn}</h2>
        <p>{t.signInLead}</p>
        <p className="t-helper">{t.signInDevice}</p>
        <label className="t-label" htmlFor="admin-email">
          {t.email}
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
        />
        <button type="submit" className="btn btn-primary">
          {t.signIn}
        </button>
        {sent && <p role="status">{t.sent}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </Shell>
  );
}

function MapRow({ map, lang, t }: { map: Row; lang: Locale; t: AdminCopy }) {
  const { rowStatus: status, late } = map;
  const name = map.contact?.first_name?.trim();
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={"t-pillar !text-base " + (name ? "" : "text-ink-muted")}>{name || t.noName}</span>
        <span className={"chip " + (late ? "!border-attention text-attention" : "")}>{t.status[status]}</span>
        <span className="t-helper">{whenWas(map.updated_at, t)}</span>
        <span className="t-label">{map.locale.toUpperCase()}</span>
      </span>
      <span className="t-helper flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span>{formatDate(map.created_at, lang)}</span>
        {map.focus_pillar && (
          <span>
            {PILLAR_NAME[lang][map.focus_pillar as Pillar]}
            {map.second_pillar ? ` · ${PILLAR_NAME[lang][map.second_pillar as Pillar]}` : ""}
          </span>
        )}
        {!map.finished_at && <span>{t.pillarOf(pillarsAnswered(map))}</span>}
        {map.contact?.email && <span>{map.contact.email}</span>}
        {late && <span className="text-attention">{t.waiting}</span>}
      </span>
    </span>
  );
}

function Overview({ sums, lang, t }: { sums: ReturnType<typeof overview>; lang: Locale; t: AdminCopy }) {
  const box = (label: string, value: string) => (
    <div key={label} className="card px-4 py-3">
      <p className="t-label">{label}</p>
      <p className="t-num !text-2xl text-ink">{value}</p>
    </div>
  );
  const lowest = Object.entries(sums.lowest).sort((a, b) => b[1] - a[1]);
  const averages = PILLARS.map((p) => [p, sums.averages[p]] as const).filter(([, v]) => v !== null);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="t-label">{t.overview}</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {box(`${t.started} · ${t.week}`, String(sums.week.started))}
        {box(`${t.finished} · ${t.week}`, String(sums.week.finished))}
        {box(`${t.shared} · ${t.week}`, String(sums.week.shared))}
        {box(t.completion, `${sums.completionRate}%`)}
        {box(`${t.started} · ${t.month}`, String(sums.month.started))}
        {box(`${t.finished} · ${t.month}`, String(sums.month.finished))}
        {box(t.shareRate, `${sums.shareRate}%`)}
        {sums.followedRecommendation !== null && box(t.followed, `${sums.followedRecommendation}%`)}
      </div>
      <p className="t-helper">{t.completionNote}</p>

      {/* §12 asks for started and finished by language, not one count of each language. */}
      <div className="card px-4 py-3">
        <p className="t-label">{t.byLanguage}</p>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="t-helper">
              <th scope="col" />
              <th scope="col">{`${t.started} · ${t.week}`}</th>
              <th scope="col">{`${t.finished} · ${t.week}`}</th>
              <th scope="col">{`${t.started} · ${t.month}`}</th>
              <th scope="col">{`${t.finished} · ${t.month}`}</th>
            </tr>
          </thead>
          <tbody>
            {(["pt", "en"] as const).map((l) => (
              <tr key={l}>
                <th scope="row" className="t-label">
                  {l.toUpperCase()}
                </th>
                <td className="t-num text-ink">{sums.languages.week[l].started}</td>
                <td className="t-num text-ink">{sums.languages.week[l].finished}</td>
                <td className="t-num text-ink">{sums.languages.month[l].started}</td>
                <td className="t-num text-ink">{sums.languages.month[l].finished}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {averages.length > 0 && (
        <div className="card px-4 py-3">
          <p className="t-label">{t.averages}</p>
          <p className="t-helper">{t.averagesCount(sums.counts.finished, sums.counts.shared)}</p>

          {/* Two bars per pillar: everyone who finished, and the ones who went on to share.
              Where they part company is the interesting part. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-2">
              <span className="chip-dot bg-rose-500" aria-hidden="true" />
              {t.averagesAll}
            </span>
            <span className="flex items-center gap-2">
              <span className="chip-dot bg-plum-600" aria-hidden="true" />
              {t.averagesShared}
            </span>
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {averages.map(([pillar, value]) => (
              <li key={pillar} className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-1">
                <span className="row-span-2">{PILLAR_NAME[lang][pillar]}</span>
                <span className="flex items-center gap-2">
                  <span
                    className="bar-fill block h-3 rounded-r-[4px] bg-rose-500"
                    style={{ width: `${(value ?? 0) * 0.6}%` }}
                    aria-hidden="true"
                  />
                  <span className="t-num text-ink">{value}</span>
                </span>
                <span className="flex items-center gap-2">
                  {sums.counts.shared > 0 ? (
                    <>
                      <span
                        className="bar-fill block h-3 rounded-r-[4px] bg-plum-600"
                        style={{ width: `${(sums.averagesShared[pillar] ?? 0) * 0.6}%` }}
                        aria-hidden="true"
                      />
                      <span className="t-num text-ink">{sums.averagesShared[pillar]}</span>
                    </>
                  ) : (
                    <span className="t-helper">{t.averagesNone}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lowest.length > 0 && (
        <div className="card px-4 py-3">
          <p className="t-label">{t.lowest}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {lowest.map(([pillar, count]) => (
              <li key={pillar} className="flex items-center gap-2">
                <span className="w-28">{PILLAR_NAME[lang][pillar as Pillar]}</span>
                <span
                  className="bar-fill block h-3 rounded-r-[4px] bg-rose-500"
                  style={{ width: `${(count / lowest[0][1]) * 60}%` }}
                  aria-hidden="true"
                />
                <span className="t-num text-ink">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Detail({
  map,
  lang,
  t,
  onClose,
  onSaved,
}: {
  map: Row;
  lang: Locale;
  t: AdminCopy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(map.note ?? "");
  const [status, setStatusValue] = useState(map.status);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scores = PILLARS.map((p) => [PILLAR_NAME[lang][p], map[`score_${p}` as keyof AdminMap] as number | null] as const);
  const answers = answersOf(map);
  const complete = scores.every(([, v]) => typeof v === "number");
  // Her own wheel, the same one she saw (§12). Only a finished Map has all six.
  const wheelScores = complete
    ? (Object.fromEntries(PILLARS.map((p) => [p, map[`score_${p}` as keyof AdminMap] as number])) as Scores)
    : null;

  // The panel takes the place of the list rather than appearing under it, so there is no
  // doubt about which woman is on screen. Focus moves to her name for the same reason.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="flex flex-col gap-4" aria-label={t.detail}>
      <button type="button" className="no-print link min-h-11 self-start" onClick={onClose}>
        <span aria-hidden="true">←&nbsp;</span>
        {t.back}
      </button>

      <div className="card flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 ref={headingRef} tabIndex={-1} className="t-pillar !text-xl outline-none">
            {map.contact?.first_name || t.noName}
          </h2>
          <span className="t-helper">
            {formatDate(map.created_at, lang)} · {t.status[map.rowStatus]}
          </span>
        </div>

        {map.sharedDays !== null && <p className="t-helper">{t.sinceShared(map.sharedDays)}</p>}
        {map.recommended_path && (
          <p className="t-helper">
            {t.suggested}: {t.pathName[map.recommended_path] ?? map.recommended_path}
          </p>
        )}

        {wheelScores ? (
          <div className="flex flex-col gap-4">
            <Wheel scores={wheelScores} animate={false} selected={null} onSelect={() => {}} />
            <Bars scores={wheelScores} focus={focusPillars(wheelScores)} />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            {scores.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2 border-b border-line py-1">
                <dt>{label}</dt>
                <dd className="t-num text-ink">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Everything she answered, written out the way it reads on her own printed Map —
            this is what Rê goes through with her in the first conversation. */}
        {answers ? (
          <PrintAnswers answers={answers} context={asContext(map)} journey={asJourney(map)} always title={t.answersTitle} />
        ) : (
          <div>
            <p className="t-label">{t.answersCodes}</p>
            {/* Only a Map that was actually shared can be missing its answers. On every other
                Map there is nothing to explain (review 6, finding 5). */}
            {map.contact && <p className="t-helper">{missingAnswers(map, t)}</p>}
            <p className="t-helper">
              {[map.age_band, map.life_stage, map.caring_for, map.in_treatment, map.duration, ...(map.focus_topics ?? [])]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="t-helper">{[...(map.tried ?? []), ...(map.obstacles ?? []), map.readiness].filter(Boolean).join(" · ")}</p>
          </div>
        )}

        {map.contact && (
          <div>
            <p className="t-label">{t.contact}</p>
            <p>{map.contact.email}</p>
            {map.contact.whatsapp && (
              <p>
                <a
                  className="link"
                  href={`https://wa.me/${map.contact.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.whatsapp} · {map.contact.whatsapp}
                </a>
              </p>
            )}
            {map.contact.instagram && <p>{map.contact.instagram}</p>}
            {/* The two consents are separate on purpose (§13), so Rê can see both before she
                writes to anybody (review 5, finding 8). */}
            <p className="t-helper mt-2">{t.consentShare}</p>
            <p className="t-helper">{map.contact.consent_email ? t.consentEmailYes : t.consentEmailNo}</p>
            {map.contact.vision && <p className="mt-2">“{map.contact.vision}”</p>}
            {map.contact.question_for_re && <p className="mt-2">“{map.contact.question_for_re}”</p>}
          </div>
        )}

        <div className="no-print flex flex-wrap gap-2">
          {(["open", "contacted", "joined", "not_now"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={"chip " + (status === value ? "!border-rose-600 bg-rose-100" : "")}
              aria-pressed={status === value}
              onClick={() => setStatusValue(value)}
            >
              {t.reStatus[value]}
            </button>
          ))}
        </div>

        <label className="no-print t-label" htmlFor="admin-note">
          {t.note}
        </label>
        <textarea
          id="admin-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="no-print w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
        />
        {failed && (
          <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
            {failed}
          </p>
        )}
        <button
          type="button"
          className="no-print btn btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setFailed(null);
            const ok = await setStatus(map.id, status, note.trim() || null);
            setSaving(false);
            if (ok) onSaved();
            else setFailed(t.saveFailed);
          }}
        >
          {saving ? t.saving : t.save}
        </button>

        <div className="no-print flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary !w-auto" onClick={() => window.print()}>
            {t.print}
          </button>
          <span className="t-helper">{t.printHint}</span>
          {/* Spec §13, the right to be forgotten. Two presses, never one. */}
          {confirming ? (
            <>
              <span className="t-helper">{t.deleteConfirm}</span>
              <button
                type="button"
                className="link min-h-11 text-attention"
                onClick={async () => {
                  const ok = await deleteMap(map.id);
                  if (ok) onSaved();
                  else setFailed(t.deleteFailed);
                }}
              >
                {t.deleteYes}
              </button>
              <button type="button" className="link min-h-11" onClick={() => setConfirming(false)}>
                {t.deleteNo}
              </button>
            </>
          ) : (
            <button type="button" className="link min-h-11" onClick={() => setConfirming(true)}>
              {t.delete}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function downloadCsv(maps: AdminMap[]) {
  const blob = new Blob(["﻿" + toCsv(maps)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `equilibrar-mapas-${new Date().toISOString().slice(0, 10)}.csv`;
  // Some browsers cancel a download whose anchor was never in the page, or whose object URL
  // was revoked in the same tick (review 5, finding 19).
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
