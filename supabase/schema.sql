-- The Equilibrar Map — database (spec v4 §5, §12, §13)
--
-- Run this once in the Supabase project, in the SQL editor. It creates two tables, the
-- rules about who may read and write what, and the clean-up job.
--
-- The shape of it follows the privacy position: a Map is anonymous while she answers, and
-- only becomes a person when she presses "Share my Map with Rê". The browser writes with
-- the public key; the rules below are what protect the data, not the app.
--
-- Running it again on an existing project is safe: everything here is written to be
-- repeatable.

-- ---------------------------------------------------------------- maps -------------
-- One row per Map, created when she starts and updated as she goes. Nothing here can
-- identify her: no name, no email, no free text, and never the 24 individual answers or
-- which check-in boxes were ticked.
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locale text not null check (locale in ('pt', 'en')),

  -- how far she got, for "in progress" and the drop-off figures
  step text not null default 'about',
  finished_at timestamptz,

  -- her context and journey answers, as codes (spec §4)
  age_band text, life_stage text, caring_for text,
  support_home smallint check (support_home between 0 and 4),
  work_flex text,
  in_treatment text,
  focus_topics text[] not null default '{}',
  duration text,
  tried text[] not null default '{}',
  obstacles text[] not null default '{}',
  readiness text,

  -- the six scores, each written once its four statements are answered
  score_space smallint check (score_space between 0 and 100),
  score_routine smallint check (score_routine between 0 and 100),
  score_sleep smallint check (score_sleep between 0 and 100),
  score_calm smallint check (score_calm between 0 and 100),
  score_food smallint check (score_food between 0 and 100),
  score_strength smallint check (score_strength between 0 and 100),

  focus_pillar text, second_pillar text,
  recommended_path text, chosen_path text,

  -- set when she presses "Share my Map with Rê"
  shared_at timestamptz,
  -- Rê's own follow-up, set by her in the admin view
  status text not null default 'open' check (status in ('open', 'contacted', 'joined', 'not_now')),
  note text
);

create index if not exists maps_created_at_idx on public.maps (created_at desc);
create index if not exists maps_shared_at_idx on public.maps (shared_at desc nulls last);

-- The clock is the database's, never the visitor's. A phone whose clock is a year slow
-- would otherwise hand us an `updated_at` a year old and have its Map deleted overnight
-- (review 5, finding 13). `finished_at` is genuinely hers — it is the moment printed on her
-- own Map — so it is kept, but never allowed to be in the future.
create or replace function public.stamp_map() returns trigger
language plpgsql as $fn$
begin
  new.updated_at := now();
  if new.finished_at is not null and new.finished_at > now() then
    new.finished_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists maps_stamp on public.maps;
create trigger maps_stamp before insert or update on public.maps
  for each row execute function public.stamp_map();

-- ------------------------------------------------------------- contacts ------------
-- Only exists once she has shared her Map, with both consents recorded. Her 90-day words
-- and her question for Rê are here only if she ticked the box that allows Rê to read them.
-- Written only by `share_map()` below, never by the visitor directly.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  created_at timestamptz not null default now(),
  first_name text,
  email text not null,
  whatsapp text,
  instagram text,
  consent_share boolean not null default false,
  consent_email boolean not null default false,
  vision text,        -- J3, only with consent_share
  question_for_re text -- J5, only with consent_share
);

-- Her 24 statement answers, 0–4 each, in question order. They live here and never on
-- `maps`, because that is the whole point: while she is answering, the individual answers
-- stay on her own device and only the six scores are saved. They travel only when she
-- presses Share and ticks the first consent — Rê reads them with her in the first
-- conversation, which is what the answers are for.
alter table public.contacts add column if not exists answers smallint[];
alter table public.contacts drop constraint if exists contacts_answers_shape;
alter table public.contacts add constraint contacts_answers_shape
  check (answers is null or (array_length(answers, 1) = 24 and 0 <= all (answers) and 4 >= all (answers)));

create index if not exists contacts_map_id_idx on public.contacts (map_id);

-- One share per Map. A second attempt — she walks back to the paths screen, or a stalled
-- request that actually succeeded — can no longer write a second row or send Rê a second
-- email (review 5, finding 10).
create unique index if not exists contacts_one_per_map on public.contacts (map_id);

-- --------------------------------------------------------------- admins ------------
-- Who may see the admin view. Rê, and optionally one assistant. Add rows by hand in the
-- Supabase table editor; being on this list is what row-level security checks.
create table if not exists public.admins (
  email text primary key,
  added_at timestamptz not null default now()
);

-- The address has to be one Supabase has proved, not one merely claimed in a token: if
-- email confirmations were ever switched off in the project, an unverified address could
-- otherwise name itself an admin (review 5, finding 7).
--
-- It asks the account table directly rather than trusting the token's own description of
-- itself. The first version read `user_metadata.email_verified`, which accounts made by
-- hand in the Supabase dashboard do not always carry — so Rê would have been refused even
-- though she was on the list. `email_confirmed_at` is set however the account was made.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
      from auth.users u
      join public.admins a on lower(a.email) = lower(u.email)
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
  );
$fn$;

-- ------------------------------------------------------------ the rules ------------
alter table public.maps enable row level security;
alter table public.contacts enable row level security;
alter table public.admins enable row level security;

-- A visitor may create her own Map and update it while she is answering. She may not read
-- anyone's Map back, including her own: the app keeps her copy on her own device, so
-- nothing is gained by allowing reads, and a leak of the public key would expose nothing.
drop policy if exists "a visitor may start a map" on public.maps;
create policy "a visitor may start a map" on public.maps
  for insert to anon with check (shared_at is null and status = 'open' and note is null);

-- There is no update rule for a visitor, and that is deliberate. Postgres applies the READ
-- rules to the rows an `update … where id = …` has to find, and a visitor may not read any
-- Map — so an update by id can never match anything. It answers "204, nothing changed", the
-- app ignores failures by design, and every Map would have sat in Rê's list frozen at the
-- first step with no answers. Saving goes through `save_map()` below instead, the same way
-- sharing goes through `share_map()`.
drop policy if exists "a visitor may update an unshared map" on public.maps;

-- Saving as she answers. Only the columns listed here can be written, `shared_at`, `status`
-- and `note` are not among them, and a Map that was already shared or is older than the
-- 30 days §13 keeps it for is left alone. Anything not in the patch keeps its value.
create or replace function public.save_map(p_map_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update public.maps set
    locale          = coalesce(p_patch->>'locale', locale),
    step            = coalesce(p_patch->>'step', step),
    age_band        = case when p_patch ? 'age_band'        then p_patch->>'age_band'        else age_band end,
    life_stage      = case when p_patch ? 'life_stage'      then p_patch->>'life_stage'      else life_stage end,
    caring_for      = case when p_patch ? 'caring_for'      then p_patch->>'caring_for'      else caring_for end,
    support_home    = case when p_patch ? 'support_home'    then (p_patch->>'support_home')::smallint else support_home end,
    work_flex       = case when p_patch ? 'work_flex'       then p_patch->>'work_flex'       else work_flex end,
    in_treatment    = case when p_patch ? 'in_treatment'    then p_patch->>'in_treatment'    else in_treatment end,
    duration        = case when p_patch ? 'duration'        then p_patch->>'duration'        else duration end,
    readiness       = case when p_patch ? 'readiness'       then p_patch->>'readiness'       else readiness end,
    focus_topics    = case when jsonb_typeof(p_patch->'focus_topics') = 'array'
                           then array(select jsonb_array_elements_text(p_patch->'focus_topics')) else focus_topics end,
    tried           = case when jsonb_typeof(p_patch->'tried') = 'array'
                           then array(select jsonb_array_elements_text(p_patch->'tried')) else tried end,
    obstacles       = case when jsonb_typeof(p_patch->'obstacles') = 'array'
                           then array(select jsonb_array_elements_text(p_patch->'obstacles')) else obstacles end,
    score_space     = case when p_patch ? 'score_space'     then (p_patch->>'score_space')::smallint    else score_space end,
    score_routine   = case when p_patch ? 'score_routine'   then (p_patch->>'score_routine')::smallint  else score_routine end,
    score_sleep     = case when p_patch ? 'score_sleep'     then (p_patch->>'score_sleep')::smallint    else score_sleep end,
    score_calm      = case when p_patch ? 'score_calm'      then (p_patch->>'score_calm')::smallint     else score_calm end,
    score_food      = case when p_patch ? 'score_food'      then (p_patch->>'score_food')::smallint     else score_food end,
    score_strength  = case when p_patch ? 'score_strength'  then (p_patch->>'score_strength')::smallint else score_strength end,
    focus_pillar    = case when p_patch ? 'focus_pillar'    then p_patch->>'focus_pillar'    else focus_pillar end,
    second_pillar   = case when p_patch ? 'second_pillar'   then p_patch->>'second_pillar'   else second_pillar end,
    recommended_path = case when p_patch ? 'recommended_path' then p_patch->>'recommended_path' else recommended_path end,
    finished_at     = case when p_patch ? 'finished_at'     then (p_patch->>'finished_at')::timestamptz else finished_at end
  where id = p_map_id
    and shared_at is null
    and created_at > now() - interval '30 days';
end;
$fn$;

-- The old rule let a visitor write a contact row against any Map that was already shared.
-- Sharing now happens only inside share_map(), so nothing writes this table directly.
drop policy if exists "a visitor may share her map once" on public.contacts;

-- Sharing is one step, or it is nothing. This marks the Map shared and writes the contact
-- row in a single transaction, so a dropped connection can no longer leave a Map that says
-- "shared" with nobody attached and no email to Rê (review 5, finding 9). It is the only
-- thing that ever sets `shared_at`, it refuses without consent, and it refuses a Map that
-- was already shared. Her own words are stored only with the second, separate consent —
-- the app leaves them out, and the length limits here are the backstop.
-- The signature gained p_answers, so the old one has to go rather than sit beside it as a
-- second version PostgREST cannot choose between.
drop function if exists public.share_map(uuid, text, text, text, text, text, boolean, boolean, text, text);

create or replace function public.share_map(
  p_map_id uuid,
  p_first_name text,
  p_email text,
  p_whatsapp text,
  p_instagram text,
  p_chosen_path text,
  p_consent_share boolean,
  p_consent_email boolean,
  p_vision text,
  p_question text,
  p_answers jsonb default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
begin
  if p_consent_share is not true then
    raise exception 'consent required';
  end if;
  if p_email is null or length(btrim(p_email)) = 0 then
    raise exception 'email required';
  end if;

  update public.maps
     set shared_at = now(),
         chosen_path = coalesce(p_chosen_path, chosen_path)
   where id = p_map_id
     and shared_at is null
     and created_at > now() - interval '30 days'
  returning id into v_id;

  if v_id is null then
    raise exception 'map not available';
  end if;

  insert into public.contacts (
    map_id, first_name, email, whatsapp, instagram,
    consent_share, consent_email, vision, question_for_re, answers
  ) values (
    v_id,
    left(p_first_name, 60), left(btrim(p_email), 254), left(p_whatsapp, 40), left(p_instagram, 60),
    true, coalesce(p_consent_email, false),
    left(p_vision, 2000), left(p_question, 2000),
    case when jsonb_typeof(p_answers) = 'array' and jsonb_array_length(p_answers) = 24
         then array(select (jsonb_array_elements_text(p_answers))::smallint)
         else null end
  );
end;
$fn$;

-- Rê (and anyone on the admins list) reads everything and keeps her own follow-up notes.
drop policy if exists "an admin reads every map" on public.maps;
create policy "an admin reads every map" on public.maps for select to authenticated using (public.is_admin());

drop policy if exists "an admin updates status and note" on public.maps;
create policy "an admin updates status and note" on public.maps for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Spec §13, the right to be forgotten: Rê can remove a woman from her own page, and the
-- contact row goes with the Map through `on delete cascade` (review 5, finding 8).
drop policy if exists "an admin may delete a map" on public.maps;
create policy "an admin may delete a map" on public.maps for delete to authenticated using (public.is_admin());

drop policy if exists "an admin reads contacts" on public.contacts;
create policy "an admin reads contacts" on public.contacts for select to authenticated using (public.is_admin());

drop policy if exists "an admin reads the admin list" on public.admins;
create policy "an admin reads the admin list" on public.admins for select to authenticated using (public.is_admin());

-- ----------------------------------------------------------- retention -------------
-- Spec §13: unfinished Maps go after 30 days without activity, finished but unshared ones
-- after 12 months. Shared Maps are kept while she is a subscriber or client, plus 24 months,
-- which is a decision for Rê, so they are never deleted automatically — she removes those
-- herself from her own page.
create or replace function public.delete_old_maps() returns void
language sql security definer set search_path = public as $fn$
  delete from public.maps
   where shared_at is null
     and (
       (finished_at is null and updated_at < now() - interval '30 days')
       or (finished_at is not null and finished_at < now() - interval '12 months')
     );
$fn$;

-- ------------------------------------------------- who may run what -----------------
-- Postgres lets everybody run a new function, and PostgREST puts everything in `public`
-- behind /rest/v1/rpc/. Without these lines the public key could run the deletion job or
-- ask the database whether it is an admin (review 5, finding 6).
--
-- `from public` is not enough: Supabase grants EXECUTE on every new function to `anon` and
-- `authenticated` by name, through default privileges, and an explicit grant survives a
-- revoke aimed at PUBLIC. Tested against the live project, where `delete_old_maps` answered
-- the public key with 204 until these two names were added. `share_map` and `save_map` are
-- the only things a visitor is meant to call, and each checks its own conditions.
revoke execute on function public.delete_old_maps() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.share_map(uuid, text, text, text, text, text, boolean, boolean, text, text, jsonb) from public;
revoke execute on function public.save_map(uuid, jsonb) from public;
grant execute on function public.share_map(uuid, text, text, text, text, text, boolean, boolean, text, text, jsonb) to anon, authenticated;
grant execute on function public.save_map(uuid, jsonb) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- --------------------------------------------------------- the nightly job ---------
-- Not optional: §13 promises the deletion, and nothing is deleted until this exists.
-- Database → Extensions → enable `pg_cron`, then run:
--   select cron.schedule('delete-old-maps', '20 3 * * *', $job$select public.delete_old_maps()$job$);
-- Check it afterwards in Database → Cron Jobs. To stop it:
--   select cron.unschedule('delete-old-maps');

-- --------------------------------------------------- notifying Rê ------------------
-- When a Map is shared, Supabase calls the Edge Function in `supabase/functions/notify-re`,
-- which sends Rê one email. Set this up after deploying the function (Database → Webhooks):
--   table: contacts · event: INSERT · type: Supabase Edge Function · function: notify-re
-- Add an HTTP header `x-webhook-secret`, with the same value as the function's
-- NOTIFY_SECRET, so that nothing but this webhook can make the function write to Rê.
