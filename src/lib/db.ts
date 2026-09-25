// Talking to Supabase from the browser (spec v4 §12). There is no server of our own: the
// public key is public by design, and `supabase/schema.sql` is what decides who may read or
// write what.
//
// Everything here is optional. With no database configured — which is how the site runs
// until Rê's project exists — `enabled` is false, every call quietly does nothing, and the
// Map behaves exactly as it does today: her answers live on her own device.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Personal } from "./conclusion.ts";
import { PILLARS, type Context, type Journey, type MapResult, type Path, type Scores } from "./scoring.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until Rê's Supabase project is configured at build time. */
export const enabled = Boolean(url && key);

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
    updated_at: new Date().toISOString(),
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

/** Starts an anonymous row when she begins. Returns its id, or null if there is no database. */
export async function startMap(locale: "pt" | "en"): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.from("maps").insert({ locale, step: "about" }).select("id").single();
  if (error) return null;
  return data.id as string;
}

/** Saves her progress. Failures are ignored on purpose: her own copy is the one that counts. */
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
  await supabase.from("maps").update(progressPayload(locale, step, context, journey, scores)).eq("id", id);
}

/** Her finished result, still anonymous. */
export async function saveResult(id: string, result: MapResult): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("maps")
    .update({
      step: "result",
      finished_at: result.completed_at,
      updated_at: new Date().toISOString(),
      focus_pillar: result.focus_pillar,
      second_pillar: result.second_pillar,
      recommended_path: result.recommended_path,
      score_space: result.score_space,
      score_routine: result.score_routine,
      score_sleep: result.score_sleep,
      score_calm: result.score_calm,
      score_food: result.score_food,
      score_strength: result.score_strength,
    })
    .eq("id", id);
}

export type ContactDetails = {
  firstName: string;
  email: string;
  whatsapp: string;
  instagram: string;
  consentShare: boolean;
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
): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  if (!contact.consentShare) return false;

  const shared = await supabase
    .from("maps")
    .update({ shared_at: new Date().toISOString(), chosen_path: chosenPath, step: "paths", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (shared.error) return false;

  const { error } = await supabase.from("contacts").insert({
    map_id: id,
    first_name: contact.firstName || null,
    email: contact.email,
    whatsapp: contact.whatsapp || null,
    instagram: contact.instagram || null,
    consent_share: contact.consentShare,
    consent_email: contact.consentEmail,
    vision: personal.shareConsent ? personal.vision || null : null,
    question_for_re: personal.shareConsent ? personal.question || null : null,
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
  } | null;
};

export async function listMaps(): Promise<AdminMap[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("maps")
    .select("*, contacts(first_name, email, whatsapp, instagram, vision, question_for_re, consent_email)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  return data.map((row) => {
    const { contacts, ...map } = row as MapRow & { contacts: AdminMap["contact"][] };
    return { ...map, contact: contacts?.[0] ?? null };
  });
}

export async function setStatus(id: string, status: MapRow["status"], note: string | null): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { error } = await supabase.from("maps").update({ status, note }).eq("id", id);
  return !error;
}

/** The overview at the top of Rê's page. */
export function overview(maps: AdminMap[], now = new Date()) {
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const started = (from: Date) => maps.filter((m) => new Date(m.created_at) >= from);
  const count = (list: AdminMap[], test: (m: AdminMap) => boolean) => list.filter(test).length;
  const week = started(since(7));
  const month = started(since(30));
  const finished = maps.filter((m) => m.finished_at);
  const lowest: Record<string, number> = {};
  for (const m of finished) if (m.focus_pillar) lowest[m.focus_pillar] = (lowest[m.focus_pillar] ?? 0) + 1;
  const stoppedAt: Record<string, number> = {};
  for (const m of maps) if (!m.finished_at) stoppedAt[m.step] = (stoppedAt[m.step] ?? 0) + 1;
  return {
    week: { started: week.length, finished: count(week, (m) => !!m.finished_at), shared: count(week, (m) => !!m.shared_at) },
    month: { started: month.length, finished: count(month, (m) => !!m.finished_at), shared: count(month, (m) => !!m.shared_at) },
    byLocale: {
      pt: count(month, (m) => m.locale === "pt"),
      en: count(month, (m) => m.locale === "en"),
    },
    completionRate: maps.length ? Math.round((finished.length / maps.length) * 100) : 0,
    shareRate: finished.length ? Math.round((maps.filter((m) => m.shared_at).length / finished.length) * 100) : 0,
    lowest,
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
    "tried", "obstacles", "readiness", "name", "email", "whatsapp", "instagram", "re_status", "note",
  ];
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join(" ") : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = maps.map((m) =>
    [
      m.created_at, statusOf(m, now), m.locale, m.step, m.focus_pillar, m.second_pillar, m.recommended_path, m.chosen_path,
      m.score_space, m.score_routine, m.score_sleep, m.score_calm, m.score_food, m.score_strength,
      m.age_band, m.life_stage, m.caring_for, m.support_home, m.work_flex, m.in_treatment, m.focus_topics, m.duration,
      m.tried, m.obstacles, m.readiness,
      m.contact?.first_name, m.contact?.email, m.contact?.whatsapp, m.contact?.instagram, m.status, m.note,
    ].map(cell).join(","),
  );
  return [head.join(","), ...rows].join("\n");
}
