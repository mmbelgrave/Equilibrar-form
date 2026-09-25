// Talking to Supabase from the browser (spec v4 §12). There is no server of our own: the
// public key is public by design, and `supabase/schema.sql` is what decides who may read or
// write what.
//
// Everything here is optional. With no database configured — which is how the site runs
// until Rê's project exists — `enabled` is false, every call quietly does nothing, and the
// Map behaves exactly as it does today: her answers live on her own device.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Personal } from "./conclusion.ts";
import { PILLARS, type Answers, type Context, type Journey, type MapResult, type Path, type Scores } from "./scoring.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * A wrong value must never break the Map. When the project URL was once set to a key by
 * mistake, supabase-js threw "Invalid supabaseUrl" on every page — the questionnaire itself
 * survived only because the call sits inside an effect. Anything that is not an http(s)
 * address is treated as "no database", which is the state the site is safe in.
 */
export function looksLikeProjectUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** False until Rê's Supabase project is configured at build time, with values that work. */
export const enabled = Boolean(url && key && looksLikeProjectUrl(url));

let client: SupabaseClient | null = null;
export function db(): SupabaseClient | null {
  if (!enabled) return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Where she has got to, for Rê's "in progress" list. */
export type Step = "about" | "pillars" | "journey" | "checkin" | "result" | "paths";

type MapRow = {
  id: string;
  locale: "pt" | "en";
  step: Step;
  finished_at: string | null;
  age_band: string | null;
  life_stage: string | null;
  caring_for: string | null;
  support_home: number | null;
  work_flex: string | null;
  in_treatment: string | null;
  focus_topics: string[];
  duration: string | null;
  tried: string[];
  obstacles: string[];
  readiness: string | null;
  score_space: number | null;
  score_routine: number | null;
  score_sleep: number | null;
  score_calm: number | null;
  score_food: number | null;
  score_strength: number | null;
  focus_pillar: string | null;
  second_pillar: string | null;
  recommended_path: string | null;
  chosen_path: string | null;
  shared_at: string | null;
  status: "open" | "contacted" | "joined" | "not_now";
  note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * What is safe to send while she is answering: coded answers and finished pillar scores.
 * Never her name, her own words, the 24 individual answers or the check-in (spec v4 §12).
 */
export function progressPayload(
  locale: "pt" | "en",
  step: Step,
  context: Context,
  journey: Journey,
  scores: Partial<Scores>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    locale,
    step,
    age_band: context.age,
    life_stage: context.stage,
    caring_for: context.caring,
    support_home: context.support,
    work_flex: context.flex === null ? null : String(context.flex),
    in_treatment: context.treatment,
    focus_topics: context.topics,
    duration: context.duration,
    tried: journey.tried,
    obstacles: journey.obstacles,
    readiness: journey.readiness,
  };
  for (const pillar of PILLARS) {
    payload[`score_${pillar}`] = scores[pillar] ?? null;
  }
  return payload;
}

/**
 * Starts an anonymous row when she begins. Returns its id, or null if there is no database.
 *
 * The id is made here rather than asked for back: no rule lets a visitor read any Map, and
 * `.select()` after an insert is a read (Postgres applies the read rules to RETURNING), so
 * asking would be refused and nothing would ever be saved (review 5, finding 2). A v4 uuid
 * made in the browser is the same random id the database would have made.
 */
export async function startMap(locale: "pt" | "en"): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const id = crypto.randomUUID();
  const { error } = await supabase.from("maps").insert({ id, locale, step: "about" });
  return error ? null : id;
}

/**
 * Saves her progress. Failures are ignored on purpose: her own copy is the one that counts.
 *
 * It goes through `save_map()` in the database rather than a plain update, because Postgres
 * applies the read rules to the rows an `update … where id = …` has to find, and a visitor
 * may not read any Map. A plain update matched nothing and answered "204, nothing changed" —
 * every Map would have sat in Rê's list frozen at the first step. Tested against the live
 * project before this was changed.
 */
export async function saveProgress(
  id: string,
  locale: "pt" | "en",
  step: Step,
  context: Context,
  journey: Journey,
  scores: Partial<Scores>,
): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase.rpc("save_map", { p_map_id: id, p_patch: progressPayload(locale, step, context, journey, scores) });
}

/**
 * Her finished result, still anonymous. Unlike the writes while she answers, nothing comes
 * after this one to heal it, and it is the write Rê's completion figures depend on — so it
 * is tried twice (review 5, finding 11).
 */
export async function saveResult(id: string, result: MapResult, attempt = 0): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const { error } = await supabase.rpc("save_map", {
    p_map_id: id,
    p_patch: {
      step: "result",
      finished_at: result.completed_at,
      focus_pillar: result.focus_pillar,
      second_pillar: result.second_pillar,
      recommended_path: result.recommended_path,
      score_space: result.score_space,
      score_routine: result.score_routine,
      score_sleep: result.score_sleep,
      score_calm: result.score_calm,
      score_food: result.score_food,
      score_strength: result.score_strength,
    },
  });
  if (error && attempt === 0) {
    await new Promise((resume) => setTimeout(resume, 2000));
    await saveResult(id, result, 1);
  }
}

/**
 * Her 24 answers, or nothing.
 *
 * They follow their own consent, not the one that lets her share at all. Sharing is what a
 * woman does to reach Rê; the individual answers are health answers next to her name, which
 * §13 treats as a heavier thing, so the box for them is separate and optional. A woman who
 * leaves it unticked still shares her Map and Rê still gets the six scores.
 *
 * Complete sets only: a half-finished Map would give Rê a page of blanks to read, and the
 * database refuses anything but 24 anyway.
 */
export function answersToSend(answers: Answers, consentAnswers: boolean): number[] | null {
  if (!consentAnswers) return null;
  if (answers.length !== 24 || answers.some((a) => a === null)) return null;
  return answers as number[];
}

export type ContactDetails = {
  firstName: string;
  email: string;
  whatsapp: string;
  instagram: string;
  /** Required: without it there is no sharing at all. */
  consentShare: boolean;
  /** Optional, and separate: her 24 answers, one by one. */
  consentAnswers: boolean;
  consentEmail: boolean;
};

/**
 * "Share my Map with Rê": marks the Map shared and writes her contact details. Her 90-day
 * words and her question for Rê travel only when she ticked the box that lets Rê read them.
 * Returns true when Rê has it.
 */
export async function shareMap(
  id: string,
  chosenPath: Path | null,
  contact: ContactDetails,
  personal: Personal,
  answers: Answers = [],
): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  if (!contact.consentShare) return false;

  // One call, one transaction. Marking the Map and writing her details used to be two
  // separate writes: a connection that dropped between them left a Map that said "shared"
  // with nobody attached, and Rê was never told (review 5, finding 9). The database also
  // refuses a Map that was already shared, so pressing the button twice cannot reach Rê
  // twice (finding 10), and `shared_at` can no longer be set by anything else (finding 5).
  const { error } = await supabase.rpc("share_map", {
    p_map_id: id,
    p_first_name: contact.firstName || null,
    p_email: contact.email,
    p_whatsapp: contact.whatsapp || null,
    p_instagram: contact.instagram || null,
    p_chosen_path: chosenPath,
    p_consent_share: contact.consentShare,
    p_consent_email: contact.consentEmail,
    p_vision: personal.shareConsent ? personal.vision || null : null,
    p_question: personal.shareConsent ? personal.question || null : null,
    // Her 24 answers, which Rê reads with her in the first conversation. They are the one
    // thing that stays on her device for the whole questionnaire and travels only here,
    // with the consent box that says so.
    p_answers: answersToSend(answers, contact.consentAnswers),
  });
  return !error;
}

/* ------------------------------------------------------------ Rê's admin view ------ */

export type MapStatus = "in_progress" | "stopped" | "finished" | "shared";

/** What Rê sees in the list, worked out from the row (spec v4 §12). */
export function statusOf(row: Pick<MapRow, "shared_at" | "finished_at" | "updated_at">, now = new Date()): MapStatus {
  if (row.shared_at) return "shared";
  if (row.finished_at) return "finished";
  const days = (now.getTime() - new Date(row.updated_at).getTime()) / 86_400_000;
  return days > 7 ? "stopped" : "in_progress";
}

/** "Pillar 3 of 6" — how far an unfinished Map got. */
export function pillarsAnswered(row: Partial<MapRow>): number {
  return PILLARS.filter((p) => typeof row[`score_${p}` as keyof MapRow] === "number").length;
}

export type AdminMap = MapRow & {
  contact: {
    first_name: string | null;
    email: string;
    whatsapp: string | null;
    instagram: string | null;
    vision: string | null;
    question_for_re: string | null;
    consent_email: boolean;
    answers: number[] | null;
  } | null;
};

/**
 * Every Map, for Rê. The error is returned rather than swallowed: a database that refuses
 * used to look exactly like a database with nothing in it (review 5, finding 20).
 */
export async function listMaps(): Promise<{ maps: AdminMap[]; error: string | null }> {
  const supabase = db();
  if (!supabase) return { maps: [], error: null };
  const { data, error } = await supabase
    .from("maps")
    .select("*, contacts(first_name, email, whatsapp, instagram, vision, question_for_re, consent_email, answers)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { maps: [], error: error.message };
  const maps = (data ?? []).map((row) => {
    const { contacts, ...map } = row as MapRow & { contacts: AdminMap["contact"][] };
    return { ...map, contact: contacts?.[0] ?? null };
  });
  return { maps, error: null };
}

/** Spec §13: Rê removes a woman's record. The contact row goes with it (on delete cascade). */
export async function deleteMap(id: string): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { error } = await supabase.from("maps").delete().eq("id", id);
  return !error;
}

export async function setStatus(id: string, status: MapRow["status"], note: string | null): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { error } = await supabase.from("maps").update({ status, note }).eq("id", id);
  return !error;
}

/**
 * The overview at the top of Rê's page (spec v4 §12).
 *
 * Two of these used to read worse than the truth: a Map started five minutes ago counted
 * against the completion rate, and every unfinished Map counted as a drop-off even while
 * the woman was still answering it. Both now leave the Maps that are still in progress out
 * (review 5, finding 16).
 */
export function overview(maps: AdminMap[], now = new Date()) {
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const started = (from: Date) => maps.filter((m) => new Date(m.created_at) >= from);
  const count = (list: AdminMap[], test: (m: AdminMap) => boolean) => list.filter(test).length;
  const week = started(since(7));
  const month = started(since(30));
  const finished = maps.filter((m) => m.finished_at);
  const settled = maps.filter((m) => statusOf(m, now) !== "in_progress"); // done with us, one way or another
  const lowest: Record<string, number> = {};
  for (const m of finished) if (m.focus_pillar) lowest[m.focus_pillar] = (lowest[m.focus_pillar] ?? 0) + 1;
  const stoppedAt: Record<string, number> = {};
  for (const m of maps) if (statusOf(m, now) === "stopped") stoppedAt[m.step] = (stoppedAt[m.step] ?? 0) + 1;
  // The average score per pillar: where the women as a group are least supported, which is
  // a different question from where each one is. Two groups, because they answer different
  // questions — everyone who finished is the honest picture of the women who do the Map,
  // and the ones who went on to share are the women Rê actually meets. A gap between the
  // two is worth her knowing about.
  const shared = finished.filter((m) => m.shared_at);
  const averageOf = (list: AdminMap[]) => {
    const out = {} as Record<(typeof PILLARS)[number], number | null>;
    for (const pillar of PILLARS) {
      const scores = list.map((m) => m[`score_${pillar}`]).filter((v): v is number => typeof v === "number");
      out[pillar] = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    }
    return out;
  };
  const averages = averageOf(finished);
  const averagesShared = averageOf(shared);
  const split = (list: AdminMap[], locale: "pt" | "en") => ({
    started: count(list, (m) => m.locale === locale),
    finished: count(list, (m) => m.locale === locale && !!m.finished_at),
  });
  return {
    week: { started: week.length, finished: count(week, (m) => !!m.finished_at), shared: count(week, (m) => !!m.shared_at) },
    month: { started: month.length, finished: count(month, (m) => !!m.finished_at), shared: count(month, (m) => !!m.shared_at) },
    byLocale: {
      pt: count(month, (m) => m.locale === "pt"),
      en: count(month, (m) => m.locale === "en"),
    },
    /** Started and finished, by language, for the week and the month (§12). */
    languages: {
      week: { pt: split(week, "pt"), en: split(week, "en") },
      month: { pt: split(month, "pt"), en: split(month, "en") },
    },
    completionRate: settled.length ? Math.round((finished.length / settled.length) * 100) : 0,
    shareRate: finished.length ? Math.round((maps.filter((m) => m.shared_at).length / finished.length) * 100) : 0,
    lowest,
    averages,
    averagesShared,
    /** How many Maps each average is made of, so a number from three women reads as one. */
    counts: { finished: finished.length, shared: shared.length },
    stoppedAt,
    followedRecommendation: (() => {
      const chosen = maps.filter((m) => m.chosen_path);
      if (!chosen.length) return null;
      return Math.round((chosen.filter((m) => m.chosen_path === m.recommended_path).length / chosen.length) * 100);
    })(),
  };
}

/** The filtered list, for her records. */
export function toCsv(maps: AdminMap[], now = new Date()): string {
  const head = [
    "date", "status", "language", "step", "focus", "second", "recommended", "chosen",
    "space", "routine", "sleep", "calm", "food", "strength",
    "age", "life_stage", "caring", "support", "work_flex", "in_treatment", "topics", "duration",
    "tried", "obstacles", "readiness", "name", "email", "whatsapp", "instagram",
    "email_consent", "re_status", "note",
  ];
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join(" ") : String(value);
    // A cell that starts with = + - or @ is run as a formula when Rê opens the file in Excel
    // or Sheets. Quoting does not stop that; a leading apostrophe does (review 5, finding 19).
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = maps.map((m) =>
    [
      m.created_at, statusOf(m, now), m.locale, m.step, m.focus_pillar, m.second_pillar, m.recommended_path, m.chosen_path,
      m.score_space, m.score_routine, m.score_sleep, m.score_calm, m.score_food, m.score_strength,
      m.age_band, m.life_stage, m.caring_for, m.support_home, m.work_flex, m.in_treatment, m.focus_topics, m.duration,
      m.tried, m.obstacles, m.readiness,
      m.contact?.first_name, m.contact?.email, m.contact?.whatsapp, m.contact?.instagram,
      m.contact ? (m.contact.consent_email ? "sim" : "não") : "",
      m.status, m.note,
    ].map(cell).join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

/**
 * Whether the signed-in account is on the admins list. Without this, an account that is not
 * on the list reads an empty list and is told there are no Maps yet (review 5, finding 20).
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}
