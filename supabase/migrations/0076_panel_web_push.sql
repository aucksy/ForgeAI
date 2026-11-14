-- NOT APPLIED LIVE. The owner's yes for the LIVE change is R-510 (14 Nov 2026: "yes to A (my pick): Build both
-- directions together, with the live database change"); he applies it himself in the SQL Editor, after 0075.
--
-- 0076: the gym's alerts (0075) reach the staff's browsers with the admin app CLOSED, on a computer or a phone
-- (R-506 phase 3, Web Push). Two locked tables and the calls around them:
--   gym_web_push        one row per browser that turned alerts on: the gym, the person (null: the old owner key),
--                       the hash of the key that saved it (when that sign-in ends, the browser gets nothing more), and
--                       the browser's push address and keys (the push company's address; no message is in it)
--   gym_alert_settings  the gym's choice: 'instant' (every alert at once), 'daily' at a time (default 11:00 am India
--                       time) or 'weekly' on a day at a time. Urgent alerts (0075: a complaint, to the owner only, a
--                       check-in number, a shop order, a friend who asked, a plan request when the plan ends in 3 days
--                       or less) always go at once. last_digest_at makes each summary go once.
-- The HQ Worker (deploy/hq/panelPush.js, every minute) asks hq_panel_push_instant for what goes now, and
-- hq_panel_digest_gyms + hq_panel_digest_claim for the summaries that are due (the time is worked out in the Worker,
-- India time; the claim itself is one atomic update, so two runs never send one summary twice). Each browser gets only
-- what its person may see (0075 _alert_visible). The Worker encrypts and signs each push (RFC 8291 + VAPID).
--
-- Additive and re-runnable: two new tables, helpers without grants, five owner/desk-key calls, four HQ-key calls.
-- Test: supabase/tests/0076_panel_web_push.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
-- Undo: drop the functions below and the tables gym_web_push and gym_alert_settings. The admin app hides what needs
-- them, and 0075 keeps working (alerts ring while the admin app is open).

set lock_timeout = '3s';

-- ------------------------------------------------------------------ tables
create table if not exists public.gym_web_push (
  sub_id     uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(gym_id) on delete cascade,
  -- null: saved with the gym's old owner key (no person).
  staff_id   uuid references public.gym_staff(staff_id) on delete cascade,
  key_hash   bytea not null,
  -- Only the big browsers' push companies (Chrome, Edge, Firefox, Safari): nothing else is ever called.
  endpoint   text not null unique check (length(endpoint) <= 800 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]{8,}$'),
  p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth       text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gym_web_push_by_gym on public.gym_web_push(gym_id, created_at);
alter table public.gym_web_push enable row level security;
revoke all on public.gym_web_push from public, anon, authenticated;

create table if not exists public.gym_alert_settings (
  gym_id         uuid primary key references public.gyms(gym_id) on delete cascade,
  mode           text not null default 'daily' check (mode in ('instant', 'daily', 'weekly')),
  -- Minutes after midnight, India time: 660 = 11:00 am.
  minute         int not null default 660 check (minute between 0 and 1439),
  -- 0 Sunday .. 6 Saturday (weekly only).
  weekday        int not null default 1 check (weekday between 0 and 6),
  last_digest_at timestamptz,
  updated_at     timestamptz not null default now()
);
alter table public.gym_alert_settings enable row level security;
revoke all on public.gym_alert_settings from public, anon, authenticated;

-- ------------------------------------------------------------------ helpers (no grants)
create or replace function public._web_push_endpoint_ok(p text) returns boolean
  language sql immutable set search_path = public as $$
  select length(coalesce(p, '')) <= 800
     and coalesce(p, '') ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]{8,}$'
$$;

-- Is the sign-in that saved this browser still live? (An owner key not retired; a session not ended, its person not
-- removed.)
create or replace function public._web_push_live(s public.gym_web_push) returns boolean
  language sql stable security definer set search_path = public as $$
  select case when s.staff_id is null
    then exists (select 1 from public.gym_owner_keys k where k.gym_id = s.gym_id and k.key_hash = s.key_hash)
    else exists (select 1 from public.gym_sessions x join public.gym_staff st on st.staff_id = x.staff_id
                  where x.key_hash = s.key_hash and x.staff_id = s.staff_id and x.ended_at is null
                    and st.removed_at is null and st.gym_id = s.gym_id) end
$$;

-- One push for the Worker: where, the browser's keys, and the words.
create or replace function public._web_push_item(s public.gym_web_push, p_title text, p_body text, p_route text, p_tag text)
  returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('subId', s.sub_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'title', p_title, 'body', p_body, 'route', p_route, 'tag', p_tag)
$$;

-- ------------------------------------------------------------------ the admin app's calls
-- This browser turns alerts on (or saves its new keys). Any key that opens the gym: the owner, the desk, a trainer.
create or replace function public.owner_save_web_push(p_key text, p_endpoint text, p_p256dh text, p_auth text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
begin
  if not public._web_push_endpoint_ok(p_endpoint)
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'INVALID';
  end if;
  insert into public.gym_web_push(gym_id, staff_id, key_hash, endpoint, p256dh, auth)
    values (g, st.staff_id, public._hash_key(p_key), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set gym_id = excluded.gym_id, staff_id = excluded.staff_id, key_hash = excluded.key_hash,
        p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  -- At most 30 browsers a gym: the longest unused go.
  delete from public.gym_web_push where sub_id in (
    select sub_id from public.gym_web_push where gym_id = g order by updated_at desc offset 30);
  return jsonb_build_object('ok', true, 'on', true);
end $$;

-- This browser turns alerts off.
create or replace function public.owner_clear_web_push(p_key text, p_endpoint text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key); n int;
begin
  delete from public.gym_web_push where gym_id = g and endpoint = coalesce(p_endpoint, '');
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'on', false, 'removed', n);
end $$;

-- Is this browser's address saved for this sign-in? (The panel shows "on" only then.)
create or replace function public.owner_web_push_on(p_key text, p_endpoint text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid := public._owner_gym(p_key);
begin
  return jsonb_build_object('ok', true, 'on', exists (
    select 1 from public.gym_web_push
     where gym_id = g and endpoint = coalesce(p_endpoint, '') and key_hash = public._hash_key(p_key)));
end $$;

-- The gym's choice. Anyone of the gym reads it; canEdit: the owner.
create or replace function public.owner_alert_settings(p_key text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  s public.gym_alert_settings;
begin
  select * into s from public.gym_alert_settings where gym_id = g;
  return jsonb_build_object('ok', true, 'mode', coalesce(s.mode, 'daily'), 'minute', coalesce(s.minute, 660),
    'weekday', coalesce(s.weekday, 1), 'canEdit', st.staff_id is null or st.role = 'owner');
end $$;

-- The owner changes it (OWNER_ONLY for the desk). A change never sends a summary twice (last_digest_at stays).
create or replace function public.owner_save_alert_settings(p_key text, p_mode text, p_minute int, p_weekday int)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g uuid := public._people_admin(p_key);
begin
  if coalesce(p_mode, '') not in ('instant', 'daily', 'weekly')
     or coalesce(p_minute, -1) not between 0 and 1439
     or coalesce(p_weekday, -1) not between 0 and 6 then
    raise exception 'INVALID';
  end if;
  insert into public.gym_alert_settings(gym_id, mode, minute, weekday) values (g, p_mode, p_minute, p_weekday)
  on conflict (gym_id) do update set mode = excluded.mode, minute = excluded.minute, weekday = excluded.weekday,
    updated_at = now();
  return public.owner_alert_settings(p_key);
end $$;

-- ------------------------------------------------------------------ the HQ Worker's calls
-- What goes NOW: urgent alerts, and every alert of a gym set to 'instant'. Each alert is taken once (sent_at), with
-- one push per browser that may see it; at most p_max pushes (a first alert always fits). Older than 6 hours: 'late',
-- never sent. Nobody to send to: 'none'. Browsers whose sign-in ended are dropped first. -> {ok, sends: [...]}
create or replace function public.hq_panel_push_instant(p_max int default 40)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := least(greatest(coalesce(p_max, 40), 1), 200);
  a public.gym_alerts;
  s public.gym_web_push;
  res jsonb := '[]'::jsonb;
  mine jsonb;
  n int := 0;
  k int;
begin
  perform public._hq_guard();
  delete from public.gym_web_push w where not public._web_push_live(w);
  update public.gym_alerts x set sent_at = now(), sent_how = 'late'
   where x.sent_at is null and x.created_at < now() - interval '6 hours'
     and (x.urgent or exists (select 1 from public.gym_alert_settings z where z.gym_id = x.gym_id and z.mode = 'instant'));
  for a in
    select x.* from public.gym_alerts x
     where x.sent_at is null and x.created_at >= now() - interval '6 hours'
       and (x.urgent or exists (select 1 from public.gym_alert_settings z where z.gym_id = x.gym_id and z.mode = 'instant'))
     order by x.created_at, x.alert_id
     limit 200
     for update of x skip locked
  loop
    mine := '[]'::jsonb;
    k := 0;
    for s in select w.* from public.gym_web_push w where w.gym_id = a.gym_id order by w.created_at loop
      if public._alert_visible(public._alert_viewer(a.gym_id, s.staff_id), a) then
        mine := mine || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members', a.line, a.route,
                                                               'mettleup-alert-' || a.alert_id));
        k := k + 1;
      end if;
    end loop;
    exit when k > 0 and n > 0 and n + k > cap;
    update public.gym_alerts set sent_at = now(), sent_how = case when k > 0 then 'instant' else 'none' end
     where alert_id = a.alert_id;
    res := res || mine;
    n := n + k;
    exit when n >= cap;
  end loop;
  return jsonb_build_object('ok', true, 'sends', res);
end $$;

-- The gyms that may have a summary due: alerts waiting (last 8 days) and at least one browser to send to, with their
-- setting (the default: daily at 11:00 am). The Worker works out the time. -> {ok, gyms: [...]}
create or replace function public.hq_panel_digest_gyms()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._hq_guard();
  return jsonb_build_object('ok', true, 'gyms', coalesce((
    select jsonb_agg(jsonb_build_object(
             'gymId', w.gym_id, 'mode', coalesce(s.mode, 'daily'), 'minute', coalesce(s.minute, 660),
             'weekday', coalesce(s.weekday, 1),
             'lastAt', floor(extract(epoch from s.last_digest_at) * 1000)::bigint,
             'oldestAt', floor(extract(epoch from w.oldest) * 1000)::bigint) order by w.oldest)
      from (select a.gym_id, min(a.created_at) as oldest
              from public.gym_alerts a
             where a.sent_at is null and a.created_at > now() - interval '8 days'
               and exists (select 1 from public.gym_web_push p where p.gym_id = a.gym_id)
             group by a.gym_id
             limit 500) w
      left join public.gym_alert_settings s on s.gym_id = w.gym_id
     where coalesce(s.mode, 'daily') <> 'instant'), '[]'::jsonb));
end $$;

-- Take one gym's summary for the slot (ms since 1970, not in the future): ONE atomic update of last_digest_at, so a
-- second run (or a retry) for the same slot gets claimed=false and sends nothing. Every waiting alert from before the
-- slot is marked 'digest'; each browser gets one push: the alert's own line when it may see one, "N new updates"
-- when more, nothing when none. -> {ok, claimed, sends: [...]}
create or replace function public.hq_panel_digest_claim(p_gym uuid, p_slot bigint, p_max int default 40)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  cap int := least(greatest(coalesce(p_max, 40), 1), 200);
  slot timestamptz;
  ids uuid[];
  s public.gym_web_push;
  v jsonb;
  one public.gym_alerts;
  n int;
  res jsonb := '[]'::jsonb;
begin
  perform public._hq_guard();
  if p_gym is null or p_slot is null or p_slot < 0 or p_slot > 32503680000000 then raise exception 'INVALID'; end if;
  slot := to_timestamp(p_slot::double precision / 1000);
  if slot > now() + interval '1 minute' then raise exception 'INVALID'; end if;
  if not exists (select 1 from public.gyms where gym_id = p_gym) then raise exception 'INVALID'; end if;
  insert into public.gym_alert_settings(gym_id) values (p_gym) on conflict (gym_id) do nothing;
  update public.gym_alert_settings set last_digest_at = now()
   where gym_id = p_gym and mode <> 'instant' and (last_digest_at is null or last_digest_at < slot);
  if not found then return jsonb_build_object('ok', true, 'claimed', false, 'sends', '[]'::jsonb); end if;
  update public.gym_alerts set sent_at = now(), sent_how = 'late'
   where gym_id = p_gym and sent_at is null and created_at <= now() - interval '8 days';
  select array_agg(alert_id) into ids from public.gym_alerts
   where gym_id = p_gym and sent_at is null and created_at < slot;
  if ids is null then return jsonb_build_object('ok', true, 'claimed', true, 'sends', '[]'::jsonb); end if;
  update public.gym_alerts set sent_at = now(), sent_how = 'digest' where alert_id = any(ids);
  for s in select w.* from public.gym_web_push w where w.gym_id = p_gym order by w.created_at loop
    exit when jsonb_array_length(res) >= cap;
    continue when not public._web_push_live(s);
    v := public._alert_viewer(p_gym, s.staff_id);
    select count(*) into n from public.gym_alerts a where a.alert_id = any(ids) and public._alert_visible(v, a);
    continue when n = 0;
    if n = 1 then
      select a.* into one from public.gym_alerts a where a.alert_id = any(ids) and public._alert_visible(v, a) limit 1;
      res := res || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members', one.line, one.route,
                                                           'mettleup-alert-' || one.alert_id));
    else
      res := res || jsonb_build_array(public._web_push_item(s, 'MettleUp: news from your members',
        format('%s new updates from your members. Open the admin app to see them.', n), '/', 'mettleup-digest'));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'claimed', true, 'sends', res);
end $$;

-- The push company said a browser's address is gone (404/410): drop it. -> {ok, dropped}
create or replace function public.hq_panel_drop_push(p_endpoints jsonb)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform public._hq_guard();
  if jsonb_typeof(p_endpoints) is distinct from 'array' then raise exception 'INVALID'; end if;
  delete from public.gym_web_push
   where endpoint in (select value from jsonb_array_elements_text(p_endpoints) limit 200);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'dropped', n);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function public._web_push_endpoint_ok(text) from public, anon, authenticated;
revoke all on function public._web_push_live(public.gym_web_push) from public, anon, authenticated;
revoke all on function public._web_push_item(public.gym_web_push, text, text, text, text) from public, anon, authenticated;
revoke all on function public.owner_save_web_push(text, text, text, text) from public;
revoke all on function public.owner_clear_web_push(text, text) from public;
revoke all on function public.owner_web_push_on(text, text) from public;
revoke all on function public.owner_alert_settings(text) from public;
revoke all on function public.owner_save_alert_settings(text, text, int, int) from public;
grant execute on function public.owner_save_web_push(text, text, text, text) to anon, authenticated;
grant execute on function public.owner_clear_web_push(text, text) to anon, authenticated;
grant execute on function public.owner_web_push_on(text, text) to anon, authenticated;
grant execute on function public.owner_alert_settings(text) to anon, authenticated;
grant execute on function public.owner_save_alert_settings(text, text, int, int) to anon, authenticated;
revoke all on function public.hq_panel_push_instant(int) from public, anon, authenticated;
revoke all on function public.hq_panel_digest_gyms() from public, anon, authenticated;
revoke all on function public.hq_panel_digest_claim(uuid, bigint, int) from public, anon, authenticated;
revoke all on function public.hq_panel_drop_push(jsonb) from public, anon, authenticated;
grant execute on function public.hq_panel_push_instant(int) to service_role;
grant execute on function public.hq_panel_digest_gyms() to service_role;
grant execute on function public.hq_panel_digest_claim(uuid, bigint, int) to service_role;
grant execute on function public.hq_panel_drop_push(jsonb) to service_role;

notify pgrst, 'reload schema';
