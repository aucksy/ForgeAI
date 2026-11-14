-- NOT APPLIED LIVE YET. The owner said yes to applying it live (R-529, 14 Nov 2026: "Yes, go ahead with the gym page
-- database change"); the main session applies it in the SQL Editor once CI's test passes.
-- NEEDS 0005, 0036, 0075, 0077 (and 0026/0027 for the HQ part): 0005 the gyms brand columns and _brand_json, 0036
-- gym_timings, 0075 gym_alerts and _alert, 0077 _self_join_closed (Join online, live since 14 Nov 2026).
-- Re-runnable: create table/index if not exists, create or replace function, the alert kind added only when missing.
-- Test: supabase/tests/0080_gym_page.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing).
--
-- 0080: F207 the gym page (R-519, R-521, R-529): every gym's own free page at https://join.mettleup.fit/<gym-slug>,
-- drawn by the panel Worker (deploy/panel/gymPageServe.js, gymPage.js) from gym_page_public. Plan:
-- docs/gym-page/PLAN.md. Nothing shows until the owner presses Publish (with the terms tick) AND the Worker host is
-- switched on (PLAN.md "Switching it on").
--
-- NEW
--   table gym_pages: one row per gym. The owner's words and photos for the page, its address part (slug), and the
--     switches: published (the owner's), indexable (the owner's: may Google list it), hidden_by_hq (MettleUp's).
--     A suspended gym's row cannot be changed (0027's trigger), except by HQ.
--   table gym_page_reports: "Report this page" from visitors, for MettleUp HQ.
--   table gym_page_asks: one row per question sent (for the per-gym and per-number daily limits only).
--   owner_gym_page(key)                     the page editor's read (owner or desk key; canEdit = owner)
--   owner_save_gym_page(key, page)          saves the whole page (OWNER only: a desk key gets OWNER_ONLY)
--     -> {ok, page} | {error: 'BAD_SLUG' | 'SLUG_TAKEN' | 'BAD_PHOTOS' | 'BAD_HIGHLIGHTS' | 'BAD_MAPS' | 'BAD_PLACE' |
--                              'BAD_TEXT' | 'NEEDS_TERMS'}
--   gym_page_public(slug)                   the page's data for the Worker (anyone; null unless published, terms
--                                           ticked, not hidden by HQ, and the gym not suspended)
--   gym_page_ask_send(slug, name, phone, question, consent)  "Ask the gym": an Enquiry in THAT gym's records + alert
--     -> {ok} | {error: 'NO_GYM' | 'CLOSED' | 'BAD_NAME' | 'BAD_PHONE' | 'BAD_QUESTION' | 'NO_CONSENT' | 'TOO_MANY'}
--   gym_page_report_send(slug, reason, details)  "Report this page" -> {ok} | {error: 'NO_GYM' | 'BAD_REASON' | 'TOO_MANY'}
--   hq_hide_gym_page(actor, slug, hidden, note)  MettleUp HQ takes a page down or puts it back (service role only,
--                                           written to hq_audit; hiding needs a note the owner sees)
--   gym_alerts kind 'page_question' (0075's check rebuilt from what it is now, as 0077 and 0078 did)
--
-- WHAT THE PUBLIC SEES (gym_page_public). The gym's name, brand, the owner's page words and photos, the gym's active
-- plans with their prices AS THE GYM SET THEM, the timings, the address, the Maps link. The gym's phone ONLY when the
-- owner switched "Show my phone number" on; the join code ONLY when Join online is open. Never: members, staff,
-- payments, the GST number, the UPI ID, enquiries.
-- LINKS. No web address may be written into any text the page shows (about, area, city, photo descriptions) or into a
-- question: _gym_page_has_link. Photos only from our own photo address for THIS gym
-- (https://join.mettleup.fit/p/<gym_id>/<id>.webp); Maps only Google's own addresses.
-- LIMITS. Questions: 40 a day per gym, 3 a day per number (TOO_MANY); the Worker adds 5 a day per network address.
-- Reports: 50 a day per page. A gym that cannot take new enquiries (paused by MettleUp, or 0062 basic / read-only)
-- answers CLOSED to a question.
--
-- Undo: drop function public.hq_hide_gym_page(text, text, boolean, text); drop function public.gym_page_report_send(text,
--   text, text); drop function public.gym_page_ask_send(text, text, text, text, boolean); drop function
--   public.gym_page_public(text); drop function public.owner_save_gym_page(text, jsonb); drop function
--   public.owner_gym_page(text); drop function public._gym_page_json(public.gym_pages); drop function
--   public._gym_page_has_link(text); drop function public._gym_details(uuid); drop function public._gym_page_plans(uuid);
--   drop table public.gym_page_asks, public.gym_page_reports, public.gym_pages. Enquiries made stay (ordinary enquiry
--   records). 'page_question' may stay in the gym_alerts check.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables (RLS on, no grants)
create table if not exists public.gym_pages (
  gym_id        uuid primary key references public.gyms(gym_id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 48),
  published     boolean not null default false,
  indexable     boolean not null default false,
  hidden_by_hq  boolean not null default false,
  hq_note       text check (hq_note is null or length(hq_note) <= 300),
  area          text check (area is null or length(area) <= 40),
  city          text check (city is null or length(city) <= 40),
  about         text check (about is null or length(about) <= 500),
  highlights    jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  -- [{url, alt}] up to 6, url on our own photo address for this gym (checked in owner_save_gym_page)
  photos        jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 6),
  maps_url      text check (maps_url is null or length(maps_url) <= 300),
  lat           double precision check (lat is null or lat between 6 and 38),
  lng           double precision check (lng is null or lng between 68 and 98),
  show_phone    boolean not null default false,
  whatsapp      boolean not null default false,
  -- R-521: the owner's switch for the page's AI helper (F208). ON by default. The helper is research only, so the admin
  -- app shows this switch only once the helper exists; the page ignores it until then.
  ai_helper     boolean not null default true,
  terms_at      timestamptz,          -- when the owner ticked "these are my gym's own fees, photos and words"
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);
alter table public.gym_pages enable row level security;
revoke all on public.gym_pages from public, anon, authenticated;

-- A suspended gym's page is frozen like the rest of its rows (0027); HQ's own writes pass (forgeai.hq).
drop trigger if exists gym_pages_not_suspended on public.gym_pages;
create trigger gym_pages_not_suspended before insert or update or delete on public.gym_pages
  for each row execute function public._gym_not_suspended();

create table if not exists public.gym_page_reports (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  reason      text not null check (reason in ('wrong', 'photos', 'offensive', 'scam', 'closed')),
  details     text check (details is null or length(details) <= 300),
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);
create index if not exists gym_page_reports_gym on public.gym_page_reports(gym_id, created_at);
alter table public.gym_page_reports enable row level security;
revoke all on public.gym_page_reports from public, anon, authenticated;

create table if not exists public.gym_page_asks (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  created_at  timestamptz not null default now()
);
create index if not exists gym_page_asks_gym on public.gym_page_asks(gym_id, created_at);
create index if not exists gym_page_asks_phone on public.gym_page_asks(phone, created_at);
alter table public.gym_page_asks enable row level security;
revoke all on public.gym_page_asks from public, anon, authenticated;

-- ------------------------------------------------------------------ 0075's alert kinds + 'page_question'
-- Rebuilt from the check as it stands (pg_get_constraintdef), so a kind another migration added (0077 'online_join',
-- 0078 'ai_credits_low', ...) is kept. The same block as 0077's, with the kind name changed.
do $$
declare c record; done boolean := false;
begin
  if to_regclass('public.gym_alerts') is null then raise exception '0080 needs 0075 (gym_alerts) first'; end if;
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%trainer_question%' loop
    if position('''page_question''' in c.def) = 0 then
      execute format('alter table public.gym_alerts drop constraint %I', c.conname);
      execute format('alter table public.gym_alerts add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''page_question''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0080: the gym_alerts kind check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''page_question''%') then
    raise exception '0080: page_question could not be added to the gym_alerts kind check';
  end if;
end $$;

-- ------------------------------------------------------------------ private helpers (no grants)
-- The plans the page shows: active, named, a real length and price (personal training included; the page says
-- "1 month"). Same reading of the plan record as 0077's _self_join_plans; at most 12 (the page's own limit).
create or replace function public._gym_page_plans(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'durationUnit', p.unit, 'durationCount', p.cnt,
                                               'priceP', p.price, 'joiningFeeP', p.fee) order by p.sort, p.name, p.id), '[]'::jsonb)
    from (select r.id, left(btrim(r.data->>'name'), 60) as name, r.data->>'durationUnit' as unit,
                 (r.data->>'durationCount')::int as cnt, (r.data->>'priceP')::bigint as price,
                 case when coalesce(r.data->>'joiningFeeP', '') ~ '^[0-9]{1,9}$' then (r.data->>'joiningFeeP')::bigint else 0 end as fee,
                 case when r.data->>'sortOrder' ~ '^-?[0-9]{1,6}$' then (r.data->>'sortOrder')::int else 0 end as sort
            from public.crm_records r
           where r.gym_id = p_gym and r.kind = 'plan' and not r.deleted
             and coalesce(r.data->>'active', 'true') <> 'false'
             and coalesce(btrim(r.data->>'name'), '') <> ''
             and r.data->>'durationUnit' in ('day', 'month')
             and coalesce(r.data->>'durationCount', '') ~ '^[1-9][0-9]{0,3}$'
             and coalesce(r.data->>'priceP', '') ~ '^[0-9]{1,9}$'
           order by 7, 2, 1
           limit 12) p
$$;

-- The gym's details record (Settings -> Gym details). Only its phone and address are ever read from it here.
create or replace function public._gym_details(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce((select data from public.crm_records
                    where gym_id = p_gym and kind = 'gym' and not deleted order by updated_at desc limit 1), '{}'::jsonb)
$$;

-- Does this text carry a web address? "https://", "www.", a bare "name.com" / "name.in" / ..., wa.me and short links.
-- PURE.
create or replace function public._gym_page_has_link(p text) returns boolean
  language sql immutable set search_path = public as $$
  select coalesce(p, '') ~* '(https?:|www\.|wa\.me/|\m[a-z0-9-]+\.(com|in|net|org|co|io|me|ly|gl|app|xyz|info|site|link|online|store|shop|biz|page|club|fit|gym)\M)'
$$;

-- The page row as the owner's editor sees it (null when there is none yet).
create or replace function public._gym_page_json(r public.gym_pages) returns jsonb
  language sql stable set search_path = public as $$
  select case when r.gym_id is null then null else jsonb_build_object(
    'slug', r.slug, 'published', r.published, 'indexable', r.indexable, 'hiddenByHq', r.hidden_by_hq, 'hqNote', r.hq_note,
    'area', r.area, 'city', r.city, 'about', r.about, 'highlights', r.highlights, 'photos', r.photos,
    'mapsUrl', r.maps_url, 'lat', r.lat, 'lng', r.lng, 'showPhone', r.show_phone, 'whatsapp', r.whatsapp,
    'aiHelper', r.ai_helper, 'termsAt', case when r.terms_at is null then null else floor(extract(epoch from r.terms_at) * 1000)::bigint end,
    'updatedAt', floor(extract(epoch from r.updated_at) * 1000)::bigint) end
$$;

revoke all on function public._gym_page_plans(uuid) from public, anon, authenticated;
revoke all on function public._gym_details(uuid) from public, anon, authenticated;
revoke all on function public._gym_page_has_link(text) from public, anon, authenticated;
revoke all on function public._gym_page_json(public.gym_pages) from public, anon, authenticated;

-- ------------------------------------------------------------------ the owner's side (admin app)
-- Owner or desk key (the desk sees the link); canEdit says whether this key may save (the owner only).
create or replace function public.owner_gym_page(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); st public.gym_staff := public._staff(p_key); r public.gym_pages;
begin
  select * into r from public.gym_pages where gym_id = g;
  -- An old owner key has no person (st null) and is the owner.
  return jsonb_build_object('page', public._gym_page_json(r), 'canEdit', st.staff_id is null or st.role = 'owner');
end $$;

-- Saves the whole page. Checks every field again (the admin app checks too); the slug is taken only if free.
-- Publishing needs the owner's tick on the page terms once (termsAgreed; kept in terms_at from then on).
create or replace function public.owner_save_gym_page(p_key text, p_page jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);      -- raises BAD_KEY, or OWNER_ONLY for a desk key
  st public.gym_staff := public._staff(p_key);
  pg jsonb := case when jsonb_typeof(p_page) = 'object' then p_page else '{}'::jsonb end;
  sl text := lower(btrim(coalesce(pg->>'slug', '')));
  photos jsonb := coalesce(pg->'photos', '[]'::jsonb);
  hl jsonb := coalesce(pg->'highlights', '[]'::jsonb);
  maps text := nullif(btrim(coalesce(pg->>'mapsUrl', '')), '');
  about text := nullif(btrim(coalesce(pg->>'about', '')), '');
  area text := nullif(btrim(regexp_replace(coalesce(pg->>'area', ''), '\s+', ' ', 'g')), '');
  city text := nullif(btrim(regexp_replace(coalesce(pg->>'city', ''), '\s+', ' ', 'g')), '');
  lat double precision; lng double precision;
  pub boolean := coalesce(pg->>'published', '') = 'true';
  agreed boolean := coalesce(pg->>'termsAgreed', '') = 'true';
  clean_photos jsonb; clean_hl jsonb; r public.gym_pages;
begin
  if sl !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(sl) not between 3 and 48
     or sl in ('api','p','gym-page','robots','sitemap','favicon','assets','j','m','c','f','app','admin','www','help','report',
               'about','privacy','terms','login','signup','start','gyms','mettleup','support','contact') then
    return jsonb_build_object('error', 'BAD_SLUG');
  end if;
  if exists (select 1 from public.gym_pages where slug = sl and gym_id <> g) then return jsonb_build_object('error', 'SLUG_TAKEN'); end if;

  -- Photos: up to 6 {url, alt}; each url on our own photo address for THIS gym. Only url and alt are kept.
  if jsonb_typeof(photos) <> 'array' then return jsonb_build_object('error', 'BAD_PHOTOS'); end if;
  if jsonb_array_length(photos) > 6 or exists (
       select 1 from jsonb_array_elements(photos) x
        where jsonb_typeof(x) <> 'object'
           or coalesce(x->>'url', '') !~ ('^https://join\.mettleup\.fit/p/' || g::text || '/[A-Za-z0-9_-]{8,64}\.webp$')
           or length(coalesce(x->>'alt', '')) > 120 or public._gym_page_has_link(x->>'alt')) then
    return jsonb_build_object('error', 'BAD_PHOTOS');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('url', x->>'url', 'alt', btrim(coalesce(x->>'alt', ''))) order by n), '[]'::jsonb)
    into clean_photos from jsonb_array_elements(photos) with ordinality as t(x, n);

  -- Facilities: the fixed list only (gymPage.js HIGHLIGHTS), at most 8, each once.
  if jsonb_typeof(hl) <> 'array' then return jsonb_build_object('error', 'BAD_HIGHLIGHTS'); end if;
  if jsonb_array_length(hl) > 8 or exists (
       select 1 from jsonb_array_elements(hl) k
        where jsonb_typeof(k) <> 'string'
           or k #>> '{}' not in ('ac','trainers','women','pt','cardio','weights','crossfit','yoga','zumba','diet','lockers',
                                 'showers','steam','parking','app')) then
    return jsonb_build_object('error', 'BAD_HIGHLIGHTS');
  end if;
  select coalesce(jsonb_agg(to_jsonb(k) order by n), '[]'::jsonb) into clean_hl
    from (select k, min(n) as n from jsonb_array_elements_text(hl) with ordinality as t(k, n) group by k) d;

  -- Google Maps: only Google's own addresses.
  if maps is not null and (length(maps) > 300
       or maps !~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.)?google\.(com|co\.in)/maps[/?])[^"''<>\s\\]*$') then
    return jsonb_build_object('error', 'BAD_MAPS');
  end if;

  -- The map pin: both or neither, inside India.
  if coalesce(pg->>'lat', '') <> '' or coalesce(pg->>'lng', '') <> '' then
    if coalesce(pg->>'lat', '') !~ '^-?[0-9]{1,3}(\.[0-9]{1,12})?$' or coalesce(pg->>'lng', '') !~ '^-?[0-9]{1,3}(\.[0-9]{1,12})?$' then
      return jsonb_build_object('error', 'BAD_PLACE');
    end if;
    lat := (pg->>'lat')::double precision; lng := (pg->>'lng')::double precision;
    if lat not between 6 and 38 or lng not between 68 and 98 then return jsonb_build_object('error', 'BAD_PLACE'); end if;
  end if;

  -- The words the page shows: within their lengths, and no web addresses (a page is not a place to send people
  -- elsewhere).
  if length(coalesce(about, '')) > 500 or length(coalesce(area, '')) > 40 or length(coalesce(city, '')) > 40
     or public._gym_page_has_link(about) or public._gym_page_has_link(area) or public._gym_page_has_link(city) then
    return jsonb_build_object('error', 'BAD_TEXT');
  end if;

  if pub and not agreed and not exists (select 1 from public.gym_pages where gym_id = g and terms_at is not null) then
    return jsonb_build_object('error', 'NEEDS_TERMS');
  end if;

  begin
    insert into public.gym_pages as t (gym_id, slug, published, indexable, area, city, about, highlights, photos, maps_url, lat, lng,
                                       show_phone, whatsapp, ai_helper, terms_at, updated_by, updated_at)
    values (g, sl, pub, coalesce(pg->>'indexable', '') = 'true', area, city, about, clean_hl, clean_photos, maps, lat, lng,
            coalesce(pg->>'showPhone', '') = 'true', coalesce(pg->>'whatsapp', '') = 'true',
            coalesce(pg->>'aiHelper', '') <> 'false',
            case when agreed then now() end, st.staff_id, now())
    on conflict (gym_id) do update set
      slug = excluded.slug, published = excluded.published, indexable = excluded.indexable, area = excluded.area,
      city = excluded.city, about = excluded.about, highlights = excluded.highlights, photos = excluded.photos,
      maps_url = excluded.maps_url, lat = excluded.lat, lng = excluded.lng, show_phone = excluded.show_phone,
      whatsapp = excluded.whatsapp, ai_helper = excluded.ai_helper, terms_at = coalesce(t.terms_at, excluded.terms_at),
      updated_by = excluded.updated_by, updated_at = now()
    returning * into r;
  exception when unique_violation then
    -- Another gym took the same slug at the same moment.
    return jsonb_build_object('error', 'SLUG_TAKEN');
  end;
  return jsonb_build_object('ok', true, 'page', public._gym_page_json(r));
end $$;

-- ------------------------------------------------------------------ the public side (the Worker, public app key)
-- A published page (terms ticked), not hidden by HQ, of a gym that is not suspended; null otherwise. Never: members,
-- staff, payments, GST number, UPI ID; the gym's number only when show_phone is on; the join code only while Join
-- online is open.
create or replace function public.gym_page_public(p_slug text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.gym_pages; g public.gyms; d jsonb; t public.gym_timings; ph text; join_open boolean;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq or r.terms_at is null then return null; end if;
  select * into g from public.gyms where gym_id = r.gym_id;
  if g.gym_id is null or g.status = 'suspended' then return null; end if;
  d := public._gym_details(g.gym_id);
  select * into t from public.gym_timings where gym_id = g.gym_id;
  ph := case when r.show_phone then public._norm_phone(d->>'phone') end;
  -- "Become a member" (Join online, 0077) only while the gym can add members.
  join_open := not public._self_join_closed(g);
  return jsonb_build_object(
    'v', 1, 'slug', r.slug, 'gymName', g.name, 'area', r.area, 'city', r.city,
    'joinCode', case when join_open then g.join_code end,
    'brand', public._brand_json(g), 'about', r.about, 'highlights', r.highlights, 'photos', r.photos,
    'plans', public._gym_page_plans(g.gym_id), 'hours', t.hours,
    'address', nullif(left(btrim(coalesce(d->>'address', '')), 200), ''), 'mapsUrl', r.maps_url, 'lat', r.lat, 'lng', r.lng,
    'contact', jsonb_build_object('phone', ph, 'whatsapp', ph is not null and r.whatsapp),
    'joinOnline', join_open,
    'indexable', r.indexable, 'aiHelper', r.ai_helper,
    'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

-- "Ask the gym": an Enquiry in that gym's records (as 0056's friend form and 0077's Join online do), and an instant
-- alert for the gym. The answer is the same whether or not the number was known to the gym.
create or replace function public.gym_page_ask_send(p_slug text, p_name text, p_phone text, p_question text, p_consent boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.gym_pages; g public.gyms; nm text; ph text; q text; v bigint; eid text; prior public.crm_records;
  now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint; today date := public._ist_today(); block jsonb;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq or r.terms_at is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  nm := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  ph := public._norm_phone(p_phone);
  if ph is null then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  q := btrim(coalesce(p_question, ''));
  if length(q) < 3 or length(q) > 500 or public._gym_page_has_link(q) then return jsonb_build_object('error', 'BAD_QUESTION'); end if;
  if p_consent is not true then return jsonb_build_object('error', 'NO_CONSENT'); end if;

  -- The gym's row lock first (the order crm_push, check-in, 0056 and 0077 use).
  select * into g from public.gyms where gym_id = r.gym_id for update;
  -- Paused by MettleUp, or 0062 basic / read-only (where a new enquiry could not be saved): CLOSED.
  if g.gym_id is null or public._self_join_closed(g) then return jsonb_build_object('error', 'CLOSED'); end if;
  if (select count(*) from public.gym_page_asks where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 40
     or (select count(*) from public.gym_page_asks where phone = ph and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;

  block := jsonb_build_object('v', 1, 'name', nm, 'question', q, 'consentAt', now_ms, 'wording', '2026-11-14', 'at', now_ms);
  v := coalesce(g.crm_version, 0) + 1;
  -- An open enquiry with this number (newest first) gets the question; else a new enquiry.
  select * into prior from public.crm_records
   where gym_id = g.gym_id and kind = 'enquiry' and not deleted and coalesce(data->>'status', 'open') = 'open'
     and public._norm_phone(data->>'phone') = ph
   order by updated_at desc limit 1;
  if prior.id is not null then
    eid := prior.id;
    update public.crm_records
       set data = prior.data || jsonb_build_object('pageAsk', block, 'followUpOn', to_char(today, 'YYYY-MM-DD'), 'updatedAt', now_ms),
           version = v, updated_at = now()
     where gym_id = g.gym_id and kind = 'enquiry' and id = eid;
  else
    eid := 'page-' || replace(gen_random_uuid()::text, '-', '');
    -- What an older admin app shows on the row (it does not read pageAsk).
    insert into public.crm_records(gym_id, kind, id, data, version)
      values (g.gym_id, 'enquiry', eid, jsonb_build_object(
                'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
                'interest', left('Asked on your web page: ' || q, 200), 'followUpOn', to_char(today, 'YYYY-MM-DD'),
                'status', 'open', 'memberId', null, 'source', null, 'pageAsk', block,
                'createdAt', now_ms, 'updatedAt', now_ms), v);
  end if;
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_page_asks(gym_id, phone) values (g.gym_id, ph);

  -- 0075: an instant alert for everyone at the gym (the first name only: never the number or the question).
  perform public._alert(g.gym_id, 'page_question', eid, 'page_question:' || eid || ':' || now_ms, 'all', true,
    format('%s asked a question on your web page. Reply from Enquiries.', public._alert_first_name(nm)), '/enquiries');
  return jsonb_build_object('ok', true);
end $$;

-- "Report this page", for MettleUp HQ. Only a page the public can see can be reported.
create or replace function public.gym_page_report_send(p_slug text, p_reason text, p_details text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.gym_pages;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq or r.terms_at is null
     or exists (select 1 from public.gyms where gym_id = r.gym_id and status = 'suspended') then
    return jsonb_build_object('error', 'NO_GYM');
  end if;
  if p_reason is null or p_reason not in ('wrong', 'photos', 'offensive', 'scam', 'closed') then
    return jsonb_build_object('error', 'BAD_REASON');
  end if;
  if (select count(*) from public.gym_page_reports where gym_id = r.gym_id and created_at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  insert into public.gym_page_reports(gym_id, reason, details)
    values (r.gym_id, p_reason, nullif(left(btrim(coalesce(p_details, '')), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ MettleUp HQ (service role only)
-- Takes a page down (hidden = true; a note of 3+ letters the owner sees in the editor) or puts it back. Logged in
-- hq_audit like 0027's actions. -> {ok: found}
create or replace function public.hq_hide_gym_page(p_actor text, p_slug text, p_hidden boolean, p_note text default null)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare hide boolean := coalesce(p_hidden, true); why text; gid uuid;
begin
  perform public._hq_guard();
  perform public._hq_actor(p_actor);              -- NO_ACTOR before anything changes
  if hide then why := left(public._hq_reason(p_note), 300); end if;
  select gym_id into gid from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if gid is null then return jsonb_build_object('ok', false); end if;
  perform set_config('forgeai.hq', 'on', true);
  update public.gym_pages set hidden_by_hq = hide, hq_note = why, updated_at = now() where gym_id = gid;
  perform set_config('forgeai.hq', 'off', true);  -- only for this one write
  perform public._hq_log(p_actor, case when hide then 'hide_gym_page' else 'show_gym_page' end, gid, why,
                         jsonb_build_object('slug', lower(btrim(p_slug))));
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ grants
-- Owner functions as every owner_* (anon + authenticated; each checks the key itself). The public page's three: anon +
-- authenticated (each checks the slug, published, HQ hide and suspension itself; the two forms have daily limits).
revoke all on function public.owner_gym_page(text) from public;
revoke all on function public.owner_save_gym_page(text, jsonb) from public;
revoke all on function public.gym_page_public(text) from public;
revoke all on function public.gym_page_ask_send(text, text, text, text, boolean) from public;
revoke all on function public.gym_page_report_send(text, text, text) from public;
revoke all on function public.hq_hide_gym_page(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.owner_gym_page(text) to anon, authenticated;
grant execute on function public.owner_save_gym_page(text, jsonb) to anon, authenticated;
grant execute on function public.gym_page_public(text) to anon, authenticated;
grant execute on function public.gym_page_ask_send(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.gym_page_report_send(text, text, text) to anon, authenticated;
grant execute on function public.hq_hide_gym_page(text, text, boolean, text) to service_role;

notify pgrst, 'reload schema';
