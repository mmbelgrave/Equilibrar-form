"use client";

import { NextIntlClientProvider } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bars } from "@/components/Bars";
import { Header } from "@/components/Header";
import { PrintAnswers } from "@/components/PrintAnswers";
import { Wheel } from "@/components/Wheel";
import {
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
import { MESSAGES, PATHS, formatDate } from "@/lib/i18n";
import {
  PATHS_ALL,
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
 * The page is in Portuguese, because it is Rê's page.
 */

const T = {
  title: "Mapas",
  signIn: "Entrar",
  signInLead: "Digite o seu e-mail. Eu mando um link para entrar — não precisa de senha.",
  email: "E-mail",
  sent: "Pronto. Olhe o seu e-mail e clique no link.",
  signOut: "Sair",
  noAccess: "Não consegui mandar o link. Confira o e-mail, ou fale com quem cuida do sistema.",
  noAccessAccount: "Esta conta não está na lista de quem pode ver os Mapas. Fale com quem cuida do sistema.",
  notConfigured: "O banco de dados ainda não está configurado, então não há Mapas para mostrar.",
  failed: "Não deu para falar com o banco de dados. Atualize a página.",
  loading: "Carregando…",
  none: "Nenhum Mapa ainda.",
  noneHere: "Nenhum Mapa com esses filtros.",
  filters: "Mostrar",
  all: "Todos",
  filterPath: "Caminho",
  filterPillar: "Área",
  filterLocale: "Idioma",
  status: {
    in_progress: "Em andamento",
    stopped: "Parou",
    finished: "Terminou",
    shared: "Compartilhou",
  } as Record<MapStatus, string>,
  reStatus: { open: "Aberto", contacted: "Já falei", joined: "Entrou", not_now: "Agora não" } as Record<string, string>,
  pathName: { community: "Comunidade", consultoria: "Consultoria", mentorship: "Mentoria" } as Record<string, string>,
  overview: "Resumo",
  started: "Começaram",
  finished: "Terminaram",
  shared: "Compartilharam",
  week: "7 dias",
  month: "30 dias",
  completion: "Taxa de conclusão",
  completionNote: "Dos Mapas que já pararam ou terminaram — os que estão em andamento ficam de fora.",
  shareRate: "Taxa de compartilhamento",
  lowest: "Pilar mais baixo, com que frequência",
  averages: "Média de cada pilar",
  averagesAll: "Todas que terminaram",
  averagesShared: "As que compartilharam com você",
  averagesCount: (finished: number, shared: number) =>
    `${finished} ${finished === 1 ? "terminou" : "terminaram"} · ${shared} ${shared === 1 ? "compartilhou" : "compartilharam"}`,
  averagesNone: "Ainda não há Mapas compartilhados para comparar.",
  byLanguage: "Começaram e terminaram, por idioma",
  stoppedAt: "Onde elas param",
  followed: "Seguiram a sugestão",
  export: "Baixar CSV",
  detail: "Detalhes",
  close: "Fechar",
  contact: "Contato",
  answers: "Respostas",
  note: "Anotação",
  save: "Salvar",
  saving: "Salvando…",
  saveFailed: "Não deu para salvar. Tente de novo.",
  whatsapp: "Abrir WhatsApp",
  consentEmailYes: "Aceitou receber e-mails da Rê",
  consentEmailNo: "Não aceitou receber e-mails",
  consentShare: "Deixou a Rê ver o Mapa dela",
  delete: "Apagar este Mapa",
  deleteConfirm: "Apagar mesmo? O Mapa e os dados dela somem para sempre.",
  deleteYes: "Sim, apagar",
  deleteNo: "Não",
  deleteFailed: "Não deu para apagar. Tente de novo.",
  print: "Imprimir este Mapa",
  printHint: "Escolha “Salvar como PDF” para guardar o Mapa dela antes da conversa.",
  answersTitle: "As respostas dela",
  noAnswers: "Este Mapa foi compartilhado antes de as respostas serem guardadas, então só as pontuações estão aqui.",
  pillarOf: (n: number) => `Pilar ${n} de 6`,
  waiting: "Esperando resposta há mais de 48 horas",
  sinceShared: (days: number) => (days < 1 ? "Compartilhou hoje" : `Compartilhou há ${Math.floor(days)} dia(s)`),
};

const PILLAR_PT: Record<Pillar, string> = {
  space: "Espaço",
  routine: "Rotina",
  sleep: "Sono",
  calm: "Calma",
  food: "Alimentação",
  strength: "Força",
};

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

/** Her 24 answers, if she sent them: 0–4 each, anything else is not a set we can print. */
const answersOf = (m: AdminMap): Answers | null => {
  const raw = m.contact?.answers;
  if (!Array.isArray(raw) || raw.length !== 24) return null;
  return raw.every((a) => Number.isInteger(a) && a >= 0 && a <= 4) ? (raw as Answer[]) : null;
};

/** A Map with the things that depend on the clock worked out when the list is read,
 * so nothing reads the time while the page is drawing. */
type Row = AdminMap & { rowStatus: MapStatus; late: boolean; sharedDays: number | null };

type Filters = { status: MapStatus | "all"; path: string; pillar: string; locale: string };
const NO_FILTERS: Filters = { status: "all", path: "all", pillar: "all", locale: "all" };

export function Admin() {
  const [email, setEmail] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [maps, setMaps] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState<Row | null>(null);

  // Who is signed in, and stay in step with the sign-in link when she follows it.
  useEffect(() => {
    const supabase = db();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

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

  if (!dbEnabled) return <Shell>{T.notConfigured}</Shell>;
  if (!email) return <SignIn />;

  const rows = (maps ?? []).filter(
    (m) =>
      (filters.status === "all" || m.rowStatus === filters.status) &&
      (filters.path === "all" || m.chosen_path === filters.path) &&
      (filters.pillar === "all" || m.focus_pillar === filters.pillar || m.second_pillar === filters.pillar) &&
      (filters.locale === "all" || m.locale === filters.locale),
  );
  const sums = overview(maps ?? []);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <Shell onSignOut={() => db()?.auth.signOut()}>
      <section className="flex flex-col gap-6">
        {error && (
          <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
            {T.failed}
          </p>
        )}
        {allowed === false && !error && (
          <p role="alert" className="card border-l-4 !border-l-attention px-4 py-3">
            {T.noAccessAccount}
          </p>
        )}

        <div className="no-print"><Overview sums={sums} /></div>

        <div className="no-print flex flex-col gap-2">
          <FilterRow
            label={T.filters}
            value={filters.status}
            options={(["all", "shared", "finished", "in_progress", "stopped"] as const).map((v) => ({
              value: v,
              label: v === "all" ? T.all : T.status[v],
            }))}
            onChange={(status) => setFilters((f) => ({ ...f, status: status as Filters["status"] }))}
          />
          <FilterRow
            label={T.filterPath}
            value={filters.path}
            options={[{ value: "all", label: T.all }, ...PATHS_ALL.map((p) => ({ value: p, label: T.pathName[p] ?? p }))]}
            onChange={(path) => setFilters((f) => ({ ...f, path }))}
          />
          <FilterRow
            label={T.filterPillar}
            value={filters.pillar}
            options={[{ value: "all", label: T.all }, ...PILLARS.map((p) => ({ value: p, label: PILLAR_PT[p] }))]}
            onChange={(pillar) => setFilters((f) => ({ ...f, pillar }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <FilterRow
              label={T.filterLocale}
              value={filters.locale}
              options={[
                { value: "all", label: T.all },
                { value: "pt", label: "PT" },
                { value: "en", label: "EN" },
              ]}
              onChange={(locale) => setFilters((f) => ({ ...f, locale }))}
            />
            <button type="button" className="link ml-auto min-h-11" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
              {T.export}
            </button>
          </div>
        </div>

        {maps === null ? (
          <p>{T.loading}</p>
        ) : rows.length === 0 ? (
          <p>{filtered ? T.noneHere : T.none}</p>
        ) : (
          <ul className="no-print flex flex-col gap-2">
            {rows.map((m) => (
              <li key={m.id}>
                <button type="button" className="card w-full px-4 py-3 text-left" onClick={() => setOpen(m)}>
                  <MapRow map={m} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        // The key rebuilds the panel for each Map. Without it, opening a second Map while
        // the first is still on screen kept the first one's note and status, and saving
        // wrote them onto the second woman's row (review 5, finding 14).
        <Detail
          key={open.id}
          map={open}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            await load();
            setOpen(null);
          }}
        />
      )}
    </Shell>
  );
}

function FilterRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="t-label w-20">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"chip " + (value === o.value ? "!border-rose-600 bg-rose-100" : "")}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  // The shared header speaks through the message files, so this page carries them too.
  return (
    <NextIntlClientProvider locale="pt" messages={MESSAGES.pt} timeZone="Europe/Lisbon">
      <Header locale="pt" hrefs={{ pt: PATHS.pt.map, en: PATHS.en.map }} variant="compact" />
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 px-5 pt-6 pb-12">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="no-print t-title">{T.title}</h1>
          {onSignOut && (
            <button type="button" className="no-print link min-h-11" onClick={onSignOut}>
              {T.signOut}
            </button>
          )}
        </div>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

function SignIn() {
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
    if (error) setError(T.noAccess);
    else setSent(true);
  }

  return (
    <Shell>
      <form className="card flex max-w-[420px] flex-col gap-3 px-4 py-4" onSubmit={submit}>
        <h2 className="t-pillar !text-xl">{T.signIn}</h2>
        <p>{T.signInLead}</p>
        <label className="t-label" htmlFor="admin-email">
          {T.email}
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
          {T.signIn}
        </button>
        {sent && <p role="status">{T.sent}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </Shell>
  );
}

function MapRow({ map }: { map: Row }) {
  const { rowStatus: status, late } = map;
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="t-num text-ink">{formatDate(map.created_at, "pt")}</span>
      <span className={"chip " + (late ? "!border-attention text-attention" : "")}>{T.status[status]}</span>
      <span className="t-label">{map.locale.toUpperCase()}</span>
      {map.contact?.first_name && <span className="t-pillar !text-base">{map.contact.first_name}</span>}
      {map.focus_pillar && (
        <span>
          {PILLAR_PT[map.focus_pillar as Pillar]}
          {map.second_pillar ? ` · ${PILLAR_PT[map.second_pillar as Pillar]}` : ""}
        </span>
      )}
      {!map.finished_at && <span className="t-helper">{T.pillarOf(pillarsAnswered(map))}</span>}
      {map.chosen_path && <span className="t-label">{T.pathName[map.chosen_path] ?? map.chosen_path}</span>}
      {late && <span className="t-helper text-attention">{T.waiting}</span>}
    </span>
  );
}

function Overview({ sums }: { sums: ReturnType<typeof overview> }) {
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
      <h2 className="t-label">{T.overview}</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {box(`${T.started} · ${T.week}`, String(sums.week.started))}
        {box(`${T.finished} · ${T.week}`, String(sums.week.finished))}
        {box(`${T.shared} · ${T.week}`, String(sums.week.shared))}
        {box(T.completion, `${sums.completionRate}%`)}
        {box(`${T.started} · ${T.month}`, String(sums.month.started))}
        {box(`${T.finished} · ${T.month}`, String(sums.month.finished))}
        {box(T.shareRate, `${sums.shareRate}%`)}
        {sums.followedRecommendation !== null && box(T.followed, `${sums.followedRecommendation}%`)}
      </div>
      <p className="t-helper">{T.completionNote}</p>

      {/* §12 asks for started and finished by language, not one count of each language. */}
      <div className="card px-4 py-3">
        <p className="t-label">{T.byLanguage}</p>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="t-helper">
              <th scope="col" />
              <th scope="col">{`${T.started} · ${T.week}`}</th>
              <th scope="col">{`${T.finished} · ${T.week}`}</th>
              <th scope="col">{`${T.started} · ${T.month}`}</th>
              <th scope="col">{`${T.finished} · ${T.month}`}</th>
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
          <p className="t-label">{T.averages}</p>
          <p className="t-helper">{T.averagesCount(sums.counts.finished, sums.counts.shared)}</p>

          {/* Two bars per pillar: everyone who finished, and the ones who went on to share.
              Where they part company is the interesting part. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-2">
              <span className="chip-dot bg-rose-500" aria-hidden="true" />
              {T.averagesAll}
            </span>
            <span className="flex items-center gap-2">
              <span className="chip-dot bg-plum-600" aria-hidden="true" />
              {T.averagesShared}
            </span>
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {averages.map(([pillar, value]) => (
              <li key={pillar} className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-1">
                <span className="row-span-2">{PILLAR_PT[pillar]}</span>
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
                    <span className="t-helper">{T.averagesNone}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lowest.length > 0 && (
        <div className="card px-4 py-3">
          <p className="t-label">{T.lowest}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {lowest.map(([pillar, count]) => (
              <li key={pillar} className="flex items-center gap-2">
                <span className="w-28">{PILLAR_PT[pillar as Pillar]}</span>
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

function Detail({ map, onClose, onSaved }: { map: Row; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(map.note ?? "");
  const [status, setStatusValue] = useState(map.status);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scores = PILLARS.map((p) => [PILLAR_PT[p], map[`score_${p}` as keyof AdminMap] as number | null] as const);
  const answers = answersOf(map);
  const complete = scores.every(([, v]) => typeof v === "number");
  // Her own wheel, the same one she saw (§12). Only a finished Map has all six.
  const wheelScores = complete
    ? (Object.fromEntries(PILLARS.map((p) => [p, map[`score_${p}` as keyof AdminMap] as number])) as Scores)
    : null;

  // It behaves like a section of the page, not a dialog: the honest thing is to move focus
  // to its heading and say so (review 5, finding 21).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="card mt-4 flex flex-col gap-4 px-4 py-4" aria-label={T.detail}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 ref={headingRef} tabIndex={-1} className="t-pillar !text-xl outline-none">
          {map.contact?.first_name || T.detail}
        </h2>
        <button type="button" className="no-print link min-h-11" onClick={onClose}>
          {T.close}
        </button>
      </div>

      {map.sharedDays !== null && <p className="t-helper">{T.sinceShared(map.sharedDays)}</p>}

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
        <PrintAnswers
          answers={answers}
          context={asContext(map)}
          journey={asJourney(map)}
          flagged={null}
          always
          title={T.answersTitle}
        />
      ) : (
        <div>
          <p className="t-label">{T.answersTitle}</p>
          <p className="t-helper">{T.noAnswers}</p>
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
          <p className="t-label">{T.contact}</p>
          <p>{map.contact.email}</p>
          {map.contact.whatsapp && (
            <p>
              <a
                className="link"
                href={`https://wa.me/${map.contact.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {T.whatsapp} · {map.contact.whatsapp}
              </a>
            </p>
          )}
          {map.contact.instagram && <p>{map.contact.instagram}</p>}
          {/* The two consents are separate on purpose (§13), so Rê can see both before she
              writes to anybody (review 5, finding 8). */}
          <p className="t-helper mt-2">{T.consentShare}</p>
          <p className="t-helper">{map.contact.consent_email ? T.consentEmailYes : T.consentEmailNo}</p>
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
            {T.reStatus[value]}
          </button>
        ))}
      </div>

      <label className="no-print t-label" htmlFor="admin-note">
        {T.note}
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
          else setFailed(T.saveFailed);
        }}
      >
        {saving ? T.saving : T.save}
      </button>

      <div className="no-print flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary !w-auto" onClick={() => window.print()}>
          {T.print}
        </button>
        <span className="t-helper">{T.printHint}</span>
        {/* Spec §13, the right to be forgotten. Two presses, never one. */}
        {confirming ? (
          <>
            <span className="t-helper">{T.deleteConfirm}</span>
            <button
              type="button"
              className="link min-h-11 text-attention"
              onClick={async () => {
                const ok = await deleteMap(map.id);
                if (ok) onSaved();
                else setFailed(T.deleteFailed);
              }}
            >
              {T.deleteYes}
            </button>
            <button type="button" className="link min-h-11" onClick={() => setConfirming(false)}>
              {T.deleteNo}
            </button>
          </>
        ) : (
          <button type="button" className="link min-h-11" onClick={() => setConfirming(true)}>
            {T.delete}
          </button>
        )}
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
