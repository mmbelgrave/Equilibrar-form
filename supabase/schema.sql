-- The Equilibrar Map — database (spec v4 §5, §12, §13)
--
-- Run this once in the Supabase project, in the SQL editor. It creates two tables, the
-- rules about who may read and write what, and the clean-up job.
--
-- The shape of it follows the privacy position: a Map is anonymous while she answers, and
-- only becomes a person when she presses "Share my Map with Rê". The browser writes with
-- the public key; the rules below are what protect the data, not the app.

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

-- ------------------------------------------------------------- contacts ------------
-- Only exists once she has shared her Map, with both consents recorded. Her 90-day words
-- and her question for Rê are here only if she ticked the box that allows Rê to read them.
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

create index if not exists contacts_map_id_idx on public.contacts (map_id);

-- --------------------------------------------------------------- admins ------------
-- Who may see the admin view. Rê, and optionally one assistant. Add rows by hand in the
-- Supabase table editor; being on this list is what row-level security checks.
create table if not exists public.admins (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email');
$$;

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

drop policy if exists "a visitor may update an unshared map" on public.maps;
create policy "a visitor may update an unshared map" on public.maps
  for update to anon using (shared_at is null and created_at > now() - interval '1 day')
  with check (status = 'open' and note is null);

-- Sharing writes the contact row; the app sets shared_at in the same step.
drop policy if exists "a visitor may share her map once" on public.contacts;
create policy "a visitor may share her map once" on public.contacts
  for insert to anon with check (
    consent_share = true
    and exists (select 1 from public.maps m where m.id = map_id and m.shared_at is not null)
  );

-- Rê (and anyone on the admins list) reads everything and keeps her own follow-up notes.
drop policy if exists "an admin reads every map" on public.maps;
create policy "an admin reads every map" on public.maps for select to authenticated using (public.is_admin());

drop policy if exists "an admin updates status and note" on public.maps;
create policy "an admin updates status and note" on public.maps for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "an admin reads contacts" on public.contacts;
create policy "an admin reads contacts" on public.contacts for select to authenticated using (public.is_admin());

drop policy if exists "an admin reads the admin list" on public.admins;
create policy "an admin reads the admin list" on public.admins for select to authenticated using (public.is_admin());

-- ----------------------------------------------------------- retention -------------
-- Spec §13: unfinished Maps go after 30 days without activity, finished but unshared ones
-- after 12 months. Shared Maps are kept while she is a subscriber or client, plus 24 months,
-- which is a decision for Rê, so they are never deleted automatically.
create or replace function public.delete_old_maps() returns void
language sql security definer set search_path = public as $$
  delete from public.maps
   where shared_at is null
     and (
       (finished_at is null and updated_at < now() - interval '30 days')
       or (finished_at is not null and finished_at < now() - interval '12 months')
     );
$$;

-- Run it nightly (Supabase → Database → Cron):
--   select cron.schedule('delete-old-maps', '20 3 * * *', $$select public.delete_old_maps()$$);

-- --------------------------------------------------- notifying Rê ------------------
-- When a Map is shared, Supabase calls the Edge Function in `supabase/functions/notify-re`,
-- which sends Rê one email. Set this up after deploying the function (Database → Webhooks):
--   table: contacts · event: INSERT · type: Supabase Edge Function · function: notify-re
