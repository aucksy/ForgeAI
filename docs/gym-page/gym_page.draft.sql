-- DRAFT, NOT A MIGRATION, NOT APPLIED (14 Nov 2026). F207 gym page (R-519): every gym's own free page at
-- https://join.mettleup.fit/<gym-slug>. Lives in docs/ on purpose, so CI and the migration numbers never pick it up.
-- To use it: give it the next free number in supabase/migrations/, read it once more against the live schema, apply
-- it with the owner's yes (a LIVE DATABASE CHANGE), then follow docs/gym-page/PLAN.md "Switching it on".
--
-- NEEDS FIRST: 0005 (gyms brand columns, _brand_json), 0036 (gym_timings), 0075 (gym_alerts, _alert), 0077 (Join
-- online, _self_join_closed; live since 14 Nov 2026). The trial switch (R-521) is NOT here: it belongs to the self
-- sign-up work (PLAN.md "Trial").
--
-- NEW
--   table gym_pages: one row per gym. The owner's words and photos for the page, its address part (slug), and the
--     switches: published (the owner's), indexable (the owner's: may Google list it), hidden_by_hq (MettleUp's).
--   table gym_page_reports: "Report this page" from visitors, for MettleUp HQ.
--   table gym_page_asks: one row per question sent (for the per-gym and per-number daily limits only).
--   owner_gym_page(key), owner_save_gym_page(key, page)   the admin app's page editor (owner only to save)
--   gym_page_public(slug)                                  the page's data for the Worker (anyone; published only)
--   gym_page_ask_send(slug, name, phone, question, consent)  "Ask the gym": an Enquiry in THAT gym's records + alert
--   gym_page_report_send(slug, reason, details)            "Report this page"
--   hq_hide_gym_page(slug, hidden)                         MettleUp HQ takes a page down (service role only)
--   gym_alerts kind 'page_question' (rebuilt check, as 0077 did for 'online_join')
-- NOTHING about money is decided here: prices come from the gym's own plan records (_gym_page_plans), as the
-- admin app shows them.

set lock_timeout = '3s';

create table if not exists public.gym_pages (
  gym_id        uuid primary key references public.gyms(gym_id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 48),
  published     boolean not null default false,
  indexable     boolean not null default false,
  hidden_by_hq  boolean not null default false,
  hq_note       text,
  area          text check (area is null or length(area) <= 40),
  city          text check (city is null or length(city) <= 40),
  about         text check (about is null or length(about) <= 500),
  highlights    jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  -- [{url, alt}] up to 6, url on our own photo address (checked in owner_save_gym_page)
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

create table if not exists public.gym_page_reports (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  reason      text not null check (reason in ('wrong', 'photos', 'offensive', 'scam', 'closed')),
  details     text check (details is null or length(details) <= 300),
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);
alter table public.gym_page_reports enable row level security;
revoke all on public.gym_page_reports from public, anon, authenticated;

create table if not exists public.gym_page_asks (
  id          bigint generated always as identity primary key,
  gym_id      uuid not null references public.gyms(gym_id) on delete cascade,
  phone       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists gym_page_asks_gym on public.gym_page_asks(gym_id, created_at);
create index if not exists gym_page_asks_phone on public.gym_page_asks(phone, created_at);
alter table public.gym_page_asks enable row level security;
revoke all on public.gym_page_asks from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
-- The plans the page shows: active, named, a real length and price (personal training included; the page says
-- "1 month"). Same reading of the plan record as 0077's _self_join_plans.
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
           order by 7, 2
           limit 12) p
$$;

-- The gym's details record (Settings -> Gym details): phone and address.
create or replace function public._gym_details(p_gym uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce((select data from public.crm_records
                    where gym_id = p_gym and kind = 'gym' and not deleted order by updated_at desc limit 1), '{}'::jsonb)
$$;

-- The page row as the owner's editor sees it.
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
revoke all on function public._gym_page_json(public.gym_pages) from public, anon, authenticated;

-- ------------------------------------------------------------------ the owner's side (admin app)
create or replace function public.owner_gym_page(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); r public.gym_pages;
begin
  select * into r from public.gym_pages where gym_id = g;
  return jsonb_build_object('page', public._gym_page_json(r));
end $$;

-- Saves the whole page. Checks every field again (the admin app checks too); the slug is taken only if free.
-- Publishing needs the owner's tick on the page terms (terms_at) and at least one plan or the timings.
create or replace function public.owner_save_gym_page(p_key text, p_page jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_only_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  sl text := lower(btrim(coalesce(p_page->>'slug', '')));
  photos jsonb := coalesce(p_page->'photos', '[]'::jsonb);
  hl jsonb := coalesce(p_page->'highlights', '[]'::jsonb);
  maps text := nullif(btrim(coalesce(p_page->>'mapsUrl', '')), '');
  r public.gym_pages;
begin
  if sl !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(sl) not between 3 and 48
     or sl in ('api','p','gym-page','robots','sitemap','assets','j','m','c','f','app','admin','www','help','report',
               'about','privacy','terms','login','signup','start','gyms','mettleup','support','contact') then
    return jsonb_build_object('error', 'BAD_SLUG');
  end if;
  if exists (select 1 from public.gym_pages where slug = sl and gym_id <> g) then return jsonb_build_object('error', 'SLUG_TAKEN'); end if;
  if jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) > 6 or exists (
       select 1 from jsonb_array_elements(photos) x
        where jsonb_typeof(x) <> 'object' or length(coalesce(x->>'alt', '')) > 120
           or coalesce(x->>'url', '') !~ ('^https://join\.mettleup\.fit/p/' || g::text || '/[A-Za-z0-9_-]{8,64}\.webp$')) then
    return jsonb_build_object('error', 'BAD_PHOTOS');
  end if;
  if jsonb_typeof(hl) <> 'array' or jsonb_array_length(hl) > 8 or exists (
       select 1 from jsonb_array_elements_text(hl) k
        where k not in ('ac','trainers','women','pt','cardio','weights','crossfit','yoga','zumba','diet','lockers','showers','steam','parking','app')) then
    return jsonb_build_object('error', 'BAD_HIGHLIGHTS');
  end if;
  if maps is not null and maps !~ '^https://(maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.)?google\.(com|co\.in)/maps[/?])[^"''<>\s\\]*$' then
    return jsonb_build_object('error', 'BAD_MAPS');
  end if;
  -- No web addresses in the about words (a page is not a place to send people elsewhere).
  if coalesce(p_page->>'about', '') ~* '(https?://|www\.)' or length(coalesce(p_page->>'about', '')) > 500 then
    return jsonb_build_object('error', 'BAD_ABOUT');
  end if;
  if (p_page->>'published')::boolean is true and (p_page->>'termsAgreed')::boolean is not true
     and not exists (select 1 from public.gym_pages where gym_id = g and terms_at is not null) then
    return jsonb_build_object('error', 'NEEDS_TERMS');
  end if;
  insert into public.gym_pages as t (gym_id, slug, published, indexable, area, city, about, highlights, photos, maps_url, lat, lng,
                                     show_phone, whatsapp, ai_helper, terms_at, updated_by, updated_at)
  values (g, sl, coalesce((p_page->>'published')::boolean, false), coalesce((p_page->>'indexable')::boolean, false),
          nullif(left(btrim(coalesce(p_page->>'area', '')), 40), ''), nullif(left(btrim(coalesce(p_page->>'city', '')), 40), ''),
          nullif(btrim(coalesce(p_page->>'about', '')), ''), hl, photos, maps,
          case when (p_page->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_page->>'lat')::double precision end,
          case when (p_page->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_page->>'lng')::double precision end,
          coalesce((p_page->>'showPhone')::boolean, false), coalesce((p_page->>'whatsapp')::boolean, false),
          coalesce((p_page->>'aiHelper')::boolean, true),
          case when (p_page->>'termsAgreed')::boolean then now() end, st.staff_id, now())
  on conflict (gym_id) do update set
    slug = excluded.slug, published = excluded.published, indexable = excluded.indexable, area = excluded.area,
    city = excluded.city, about = excluded.about, highlights = excluded.highlights, photos = excluded.photos,
    maps_url = excluded.maps_url, lat = excluded.lat, lng = excluded.lng, show_phone = excluded.show_phone,
    whatsapp = excluded.whatsapp, ai_helper = excluded.ai_helper, terms_at = coalesce(t.terms_at, excluded.terms_at), updated_by = excluded.updated_by,
    updated_at = now()
  returning * into r;
  return jsonb_build_object('ok', true, 'page', public._gym_page_json(r));
end $$;

-- ------------------------------------------------------------------ the public side (the Worker)
-- A published, not hidden page of a gym that is not suspended. Never: members, money taken, staff, the owner's number
-- unless show_phone is on.
create or replace function public.gym_page_public(p_slug text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.gym_pages; g public.gyms; d jsonb; t public.gym_timings; ph text;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq then return null; end if;
  select * into g from public.gyms where gym_id = r.gym_id;
  if g.gym_id is null or g.status = 'suspended' then return null; end if;
  d := public._gym_details(g.gym_id);
  select * into t from public.gym_timings where gym_id = g.gym_id;
  ph := case when r.show_phone then right(regexp_replace(coalesce(d->>'phone', ''), '\D', '', 'g'), 10) end;
  return jsonb_build_object(
    'v', 1, 'slug', r.slug, 'gymName', g.name, 'area', r.area, 'city', r.city, 'joinCode', g.join_code,
    'brand', public._brand_json(g), 'about', r.about, 'highlights', r.highlights, 'photos', r.photos,
    'plans', public._gym_page_plans(g.gym_id), 'hours', t.hours,
    'address', left(btrim(coalesce(d->>'address', '')), 200), 'mapsUrl', r.maps_url, 'lat', r.lat, 'lng', r.lng,
    'contact', jsonb_build_object('phone', case when ph ~ '^[6-9][0-9]{9}$' then ph end, 'whatsapp', r.whatsapp and r.show_phone),
    -- "Become a member" (Join online, 0077, live since 14 Nov 2026) only while the gym can add members.
    'joinOnline', not public._self_join_closed(g),
    'indexable', r.indexable, 'aiHelper', r.ai_helper,
    'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

-- "Ask the gym": an Enquiry in that gym's records (as F147's friend form does), and an alert for the gym.
create or replace function public.gym_page_ask_send(p_slug text, p_name text, p_phone text, p_question text, p_consent boolean)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.gym_pages; g public.gyms; nm text; ph text; q text; v bigint; eid text; prior public.crm_records;
  now_ms bigint := floor(extract(epoch from now()) * 1000)::bigint; today date := public._ist_today(); block jsonb;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null or not r.published or r.hidden_by_hq then return jsonb_build_object('error', 'NO_GYM'); end if;
  nm := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  if length(nm) < 2 or nm !~ '[[:alpha:]]' then return jsonb_build_object('error', 'BAD_NAME'); end if;
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if ph !~ '^[6-9][0-9]{9}$' then return jsonb_build_object('error', 'BAD_PHONE'); end if;
  q := left(btrim(coalesce(p_question, '')), 500);
  if length(q) < 3 or q ~* '(https?://|www\.)' then return jsonb_build_object('error', 'BAD_QUESTION'); end if;
  if p_consent is not true then return jsonb_build_object('error', 'NO_CONSENT'); end if;

  select * into g from public.gyms where gym_id = r.gym_id for update;
  if g.gym_id is null or g.status = 'suspended' then return jsonb_build_object('error', 'CLOSED'); end if;
  if (select count(*) from public.gym_page_asks where gym_id = g.gym_id and created_at > now() - interval '1 day') >= 40
     or (select count(*) from public.gym_page_asks where phone = ph and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;

  block := jsonb_build_object('v', 1, 'question', q, 'consentAt', now_ms, 'wording', '2026-11-14', 'at', now_ms);
  v := coalesce(g.crm_version, 0) + 1;
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
    insert into public.crm_records(gym_id, kind, id, data, version)
      values (g.gym_id, 'enquiry', eid, jsonb_build_object(
                'id', eid, 'gymId', g.gym_id::text, 'name', nm, 'phone', '+91' || ph,
                'interest', left('Asked on your web page: ' || q, 200), 'followUpOn', to_char(today, 'YYYY-MM-DD'),
                'status', 'open', 'memberId', null, 'source', null, 'pageAsk', block,
                'createdAt', now_ms, 'updatedAt', now_ms), v);
  end if;
  update public.gyms set crm_version = v where gym_id = g.gym_id;
  insert into public.gym_page_asks(gym_id, phone) values (g.gym_id, ph);
  perform public._alert(g.gym_id, 'page_question', eid, 'page_question:' || eid || ':' || now_ms, 'all', true,
    format('%s asked a question on your web page. Reply from Enquiries.', public._alert_first_name(nm)), '/');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gym_page_report_send(p_slug text, p_reason text, p_details text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.gym_pages;
begin
  select * into r from public.gym_pages where slug = lower(btrim(coalesce(p_slug, '')));
  if r.gym_id is null then return jsonb_build_object('error', 'NO_GYM'); end if;
  if p_reason not in ('wrong', 'photos', 'offensive', 'scam', 'closed') then return jsonb_build_object('error', 'BAD_REASON'); end if;
  if (select count(*) from public.gym_page_reports where gym_id = r.gym_id and created_at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('error', 'TOO_MANY');
  end if;
  insert into public.gym_page_reports(gym_id, reason, details) values (r.gym_id, p_reason, nullif(left(btrim(coalesce(p_details, '')), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

-- MettleUp HQ takes a page down (or puts it back) with a note the owner sees in the editor. Service role only.
create or replace function public.hq_hide_gym_page(p_slug text, p_hidden boolean, p_note text)
  returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.gym_pages set hidden_by_hq = coalesce(p_hidden, true), hq_note = left(p_note, 300), updated_at = now()
   where slug = lower(btrim(coalesce(p_slug, '')));
  return jsonb_build_object('ok', found);
end $$;

-- ------------------------------------------------------------------ gym_alerts: add 'page_question'
-- Rebuild 0075's kind check with 'page_question' added, exactly as 0077 added 'online_join' (copy that block here
-- from 0077 lines 78-95 and change the kind name) when this draft becomes a migration.

-- ------------------------------------------------------------------ grants
revoke all on function public.owner_gym_page(text) from public;
revoke all on function public.owner_save_gym_page(text, jsonb) from public;
revoke all on function public.gym_page_public(text) from public;
revoke all on function public.gym_page_ask_send(text, text, text, text, boolean) from public;
revoke all on function public.gym_page_report_send(text, text, text) from public;
revoke all on function public.hq_hide_gym_page(text, boolean, text) from public, anon, authenticated;
grant execute on function public.owner_gym_page(text) to anon, authenticated;
grant execute on function public.owner_save_gym_page(text, jsonb) to anon, authenticated;
grant execute on function public.gym_page_public(text) to anon, authenticated;
grant execute on function public.gym_page_ask_send(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.gym_page_report_send(text, text, text) to anon, authenticated;
