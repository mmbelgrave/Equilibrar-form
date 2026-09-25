"use client";

import { NextIntlClientProvider } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import {
  db,
  enabled as dbEnabled,
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
import { PILLARS, type Pillar } from "@/lib/scoring";

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
  noAccess: "Esta conta não tem acesso. Fale com quem cuida do sistema.",
  notConfigured: "O banco de dados ainda não está configurado, então não há Mapas para mostrar.",
  loading: "Carregando…",
  none: "Nenhum Mapa ainda.",
  filters: "Mostrar",
  all: "Todos",
  status: {
    in_progress: "Em andamento",
    stopped: "Parou",
    finished: "Terminou",
    shared: "Compartilhou",
  } as Record<MapStatus, string>,
  reStatus: { open: "Aberto", contacted: "Já falei", joined: "Entrou", not_now: "Agora não" } as Record<string, string>,
  overview: "Resumo",
  started: "Começaram",
  finished: "Terminaram",
  shared: "Compartilharam",
  week: "7 dias",
  month: "30 dias",
  completion: "Taxa de conclusão",
  shareRate: "Taxa de compartilhamento",
  lowest: "Pilar mais baixo, com que frequência",
  stoppedAt: "Onde elas param",
  followed: "Seguiram a sugestão",
  export: "Baixar CSV",
  detail: "Detalhes",
  close: "Fechar",
  contact: "Contato",
  answers: "Respostas",
  note: "Anotação",
  save: "Salvar",
  saved: "Salvo",
  whatsapp: "Abrir WhatsApp",
  pillarOf: (n: number) => `Pilar ${n} de 6`,
  waiting: "Esperando resposta há mais de 48 horas",
};

const PILLAR_PT: Record<Pillar, string> = {
  space: "Espaço",
  routine: "Rotina",
  sleep: "Sono",
  calm: "Calma",
  food: "Alimentação",
  strength: "Força",
};

/** A Map with the two things that depend on the clock worked out when the list is read,
 * so nothing reads the time while the page is drawing. */
type Row = AdminMap & { rowStatus: MapStatus; late: boolean };

export function Admin() {
  const [email, setEmail] = useState<string | null>(null);
  const [maps, setMaps] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<MapStatus | "all">("all");
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
    setMaps(
      (await listMaps()).map((map) => ({
        ...map,
        rowStatus: statusOf(map, now),
        // Rê's promise is a reply within 48 hours; later than that shows in the attention colour.
        late: !!map.shared_at && map.status === "open" && now.getTime() - new Date(map.shared_at).getTime() > 48 * 3_600_000,
      })),
    );
  }, [email]);

  useEffect(() => {
    // Reading her Maps from the database is exactly what this page is for.
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  if (!dbEnabled) return <Shell>{T.notConfigured}</Shell>;
  if (!email) return <SignIn />;

  const rows = (maps ?? []).filter((m) => filter === "all" || m.rowStatus === filter);
  const sums = overview(maps ?? []);

  return (
    <Shell onSignOut={() => db()?.auth.signOut()}>
      <section className="flex flex-col gap-6">
        <Overview sums={sums} />

        <div className="no-print flex flex-wrap items-center gap-2">
          <span className="t-label">{T.filters}</span>
          {(["all", "shared", "finished", "in_progress", "stopped"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={"chip " + (filter === value ? "!border-rose-600 bg-rose-100" : "")}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? T.all : T.status[value]}
            </button>
          ))}
          <button
            type="button"
            className="link ml-auto min-h-11"
            onClick={() => downloadCsv(rows)}
            disabled={!rows.length}
          >
            {T.export}
          </button>
        </div>

        {maps === null ? (
          <p>{T.loading}</p>
        ) : rows.length === 0 ? (
          <p>{T.none}</p>
        ) : (
          <ul className="flex flex-col gap-2">
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
        <Detail
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

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  // The shared header speaks through the message files, so this page carries them too.
  return (
    <NextIntlClientProvider locale="pt" messages={MESSAGES.pt} timeZone="Europe/Lisbon">
      <Header locale="pt" hrefs={{ pt: PATHS.pt.map, en: PATHS.en.map }} variant="compact" />
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 px-5 pt-6 pb-12">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="t-title">{T.title}</h1>
          {onSignOut && (
            <button type="button" className="link min-h-11" onClick={onSignOut}>
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
      options: { emailRedirectTo: typeof window === "undefined" ? undefined : window.location.href },
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
      {map.chosen_path && <span className="t-label">{map.chosen_path}</span>}
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
  return (
    <section className="flex flex-col gap-3">
      <h2 className="t-label">{T.overview}</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {box(`${T.started} · ${T.week}`, String(sums.week.started))}
        {box(`${T.finished} · ${T.week}`, String(sums.week.finished))}
        {box(`${T.shared} · ${T.week}`, String(sums.week.shared))}
        {box(T.completion, `${sums.completionRate}%`)}
        {box(`${T.started} · ${T.month}`, String(sums.month.started))}
        {box("PT / EN · 30 d", `${sums.byLocale.pt} / ${sums.byLocale.en}`)}
        {box(T.shareRate, `${sums.shareRate}%`)}
        {sums.followedRecommendation !== null && box(T.followed, `${sums.followedRecommendation}%`)}
      </div>
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
  const scores = PILLARS.map((p) => [PILLAR_PT[p], map[`score_${p}` as keyof AdminMap] as number | null] as const);

  return (
    <div className="card mt-4 flex flex-col gap-4 px-4 py-4" role="dialog" aria-label={T.detail}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-pillar !text-xl">{map.contact?.first_name || T.detail}</h2>
        <button type="button" className="link min-h-11" onClick={onClose}>
          {T.close}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {scores.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-line py-1">
            <dt>{label}</dt>
            <dd className="t-num text-ink">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="t-label">{T.answers}</p>
        <p className="t-helper">
          {[map.age_band, map.life_stage, map.caring_for, map.in_treatment, map.duration, ...(map.focus_topics ?? [])]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="t-helper">{[...(map.tried ?? []), ...(map.obstacles ?? []), map.readiness].filter(Boolean).join(" · ")}</p>
      </div>

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
          {map.contact.vision && <p className="mt-2">“{map.contact.vision}”</p>}
          {map.contact.question_for_re && <p className="mt-2">“{map.contact.question_for_re}”</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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

      <label className="t-label" htmlFor="admin-note">
        {T.note}
      </label>
      <textarea
        id="admin-note"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-[12px] border border-line bg-surface px-4 py-3 text-base"
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await setStatus(map.id, status, note.trim() || null);
          setSaving(false);
          onSaved();
        }}
      >
        {saving ? T.saved : T.save}
      </button>
    </div>
  );
}

function downloadCsv(maps: AdminMap[]) {
  const blob = new Blob(["﻿" + toCsv(maps)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `equilibrar-mapas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
