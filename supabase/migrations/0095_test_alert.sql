-- NOT LIVE: needs the owner's yes
-- Re-runnable. Apply after 0075 (gym alerts) and 0076 (alerts with the admin app closed). Additive: two new columns on
-- gym_alerts, one new alert kind, three new calls; 0076's three HQ calls and 0075's owner_alerts are replaced with the
-- same names, arguments and grants (every alert that is not a test goes exactly as before).
-- Test: supabase/tests/0095_test_alert.sql (CI runs it after every migration; pasted into the SQL Editor it always ends
-- in an error and so changes nothing). 0075's and 0076's own tests still pass unchanged.
-- Undo: drop the three new functions, re-run 0075's owner_alerts and 0076's three hq_panel_ functions, delete the
-- 'test_alert' rows, then drop the columns sub_id and shown_at. The admin app hides the button by itself without them.
--
-- 0095: R-578 (owner, 15 Nov 2026): "Send a test alert" on the admin app's alerts card. His two friend enquiries made
-- urgent alerts, the HQ Worker sent them to both his browsers and the push company accepted both, yet his Android phone
-- showed nothing. One tap now sends a test alert to THIS browser only, through the same real path (gym_alerts ->
-- hq_panel_push_instant -> the HQ Worker -> the push company -> the admin app's service worker), and the service worker
-- says back that it showed it, so the card can answer "It showed on this device at 7:41 pm" or "not shown yet".
--   gym_alerts.sub_id    the one browser (0076 gym_web_push) a test alert goes to; null for every other alert (as
--                        before: each browser that may see it). The browser removed = its test alerts go with it.
--   gym_alerts.shown_at  when the browser's service worker showed that test alert (test alerts only).
--   kind 'test_alert'    urgent (goes at once whatever the gym's summary setting), never in the owner's lists, the
--                        bell, the summaries or any count; kept 1 day.
-- The new calls:
--   owner_send_test_alert(key, endpoint)  any key that opens the gym (owner, desk, trainer), for a browser saved with
--                                         THAT key (0076 owner_web_push_on). Once a minute a browser, 20 an hour a gym.
--                                         -> {ok, id, at} | {ok: false, error: 'NOT_ON' | 'TOO_SOON', wait}
--   owner_test_alert(key, endpoint)       this browser's latest test alert of the last hour, and how long until the
--                                         next may go -> {ok, on, test: null | {id, at, sentAt, sentHow, shownAt}, wait,
--                                         now (the server's clock, ms)}
--   panel_test_alert_shown(alert)         the service worker's "shown" (no key: it has none). Only a test alert, only
--                                         once, only within a day; the id is a random uuid only that browser got.
--                                         Nothing else is sent or answered: always {ok: true}.
-- WHAT A TEST SAYS. "MettleUp: test alert" / "Alerts work on this device. Alerts from your members will look like
-- this." The push's tag is 'mettleup-test-<alert id>' (the service worker knows a test by it); a tap opens Settings.

set lock_timeout = '3s';

-- ------------------------------------------------------------------ columns
alter table public.gym_alerts add column if not exists sub_id uuid references public.gym_web_push(sub_id) on delete cascade;
alter table public.gym_alerts add column if not exists shown_at timestamptz;
create index if not exists gym_alerts_tests on public.gym_alerts(sub_id, created_at desc) where sub_id is not null;

-- ------------------------------------------------------------------ 0075's alert kinds + 'test_alert'
do $$
declare c record; done boolean := false;
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%trainer_question%' loop
    if position('''test_alert''' in c.def) = 0 then
      execute format('alter table public.gym_alerts drop constraint %I', c.conname);
      execute format('alter table public.gym_alerts add constraint %I %s', c.conname,
                     regexp_replace(c.def, '\](\)+)\s*$', ', ''test_alert''::text]\1'));
    end if;
    done := true;
  end loop;
  if not done then raise exception '0095: the gym_alerts kind check was not found'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.gym_alerts'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%''test_alert''%') then
    raise exception '0095: test_alert could not be added to the gym_alerts kind check';
  end if;
end $$;

-- ------------------------------------------------------------------ helpers (no grants)
-- This sign-in's saved browser for this address (0076: saved with this very key), or null.
create or replace function public._test_alert_sub(p_key text, p_endpoint text) returns public.gym_web_push
  language sql stable security definer set search_path = public as $$
  select w.* from public.gym_web_push w
   where w.gym_id = public._owner_gym(p_key) and w.endpoint = coalesce(p_endpoint, '') and w.key_hash = public._hash_key(p_key)
   limit 1
$$;

-- Seconds until this browser may send another test (0: now). Once a minute a browser, 20 an hour a gym.
create or replace function public._test_alert_wait(s public.gym_web_push) returns int
  language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select ceil(extract(epoch from (max(a.created_at) + interval '60 seconds' - now())))::int
                from public.gym_alerts a where a.kind = 'test_alert' and a.sub_id = s.sub_id
                 and a.created_at > now() - interval '60 seconds'), 0),
    case when (select count(*) from public.gym_alerts a where a.kind = 'test_alert' and a.gym_id = s.gym_id
                 and a.created_at > now() - interval '1 hour') >= 20
         then coalesce((select ceil(extract(epoch from (min(x.created_at) + interval '1 hour' - now())))::int
                          from (select a.created_at from public.gym_alerts a
                                 where a.kind = 'test_alert' and a.gym_id = s.gym_id and a.created_at > now() - interval '1 hour'
                                 order by a.created_at desc limit 20) x), 60)
         else 0 end)
$$;

-- ------------------------------------------------------------------ the admin app's calls
create or replace function public.owner_send_test_alert(p_key text, p_endpoint text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  s public.gym_web_push := public._test_alert_sub(p_key, p_endpoint);
  w int;
  id uuid;
  at timestamptz;
begin
  if s.sub_id is null then return jsonb_build_object('ok', false, 'error', 'NOT_ON'); end if;
  -- One at a time per browser (two taps at once never make two).
  perform 1 from public.gym_web_push where sub_id = s.sub_id for update;
  w := public._test_alert_wait(s);
  if w > 0 then return jsonb_build_object('ok', false, 'error', 'TOO_SOON', 'wait', w); end if;
  delete from public.gym_alerts where gym_id = g and kind = 'test_alert' and created_at < now() - interval '1 day';
  insert into public.gym_alerts(gym_id, kind, ref_id, tag, audience, urgent, line, route, sub_id)
    values (g, 'test_alert', s.sub_id::text, 'test:' || gen_random_uuid(), 'all', true,
            'Alerts work on this device. Alerts from your members will look like this.', '/settings', s.sub_id)
    returning alert_id, created_at into id, at;
  return jsonb_build_object('ok', true, 'id', id, 'at', floor(extract(epoch from at) * 1000)::bigint);
end $$;

create or replace function public.owner_test_alert(p_key text, p_endpoint text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  s public.gym_web_push := public._test_alert_sub(p_key, p_endpoint);
  a public.gym_alerts;
begin
  if s.sub_id is null then
    return jsonb_build_object('ok', true, 'on', false, 'test', null, 'wait', 0, 'now', floor(extract(epoch from now()) * 1000)::bigint);
  end if;
  select x.* into a from public.gym_alerts x
   where x.kind = 'test_alert' and x.sub_id = s.sub_id and x.gym_id = g and x.created_at > now() - interval '1 hour'
   order by x.created_at desc limit 1;
  -- 'now': the gym server's clock, so a phone or computer whose own clock is off still waits the right 90 seconds.
  return jsonb_build_object('ok', true, 'on', true, 'wait', public._test_alert_wait(s),
    'now', floor(extract(epoch from now()) * 1000)::bigint, 'test', case when a.alert_id is null then null else
    jsonb_build_object('id', a.alert_id,
      'at', floor(extract(epoch from a.created_at) * 1000)::bigint,
      'sentAt', floor(extract(epoch from a.sent_at) * 1000)::bigint,
      'sentHow', a.sent_how,
      'shownAt', floor(extract(epoch from a.shown_at) * 1000)::bigint) end);
end $$;

-- The admin app's service worker showed a test alert. No key (a service worker has none); the alert id is a random
-- uuid that only reached that browser. Only a test alert, once, within a day. Always {ok: true}: it tells nothing.
create or replace function public.panel_test_alert_shown(p_alert uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  update public.gym_alerts set shown_at = now()
   where alert_id = p_alert and kind = 'test_alert' and shown_at is null and created_at > now() - interval '1 day';
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ 0075's list, without test alerts
create or replace function public.owner_alerts(p_key text, p_after bigint default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  st public.gym_staff := public._staff(p_key);
  v jsonb := public._alert_viewer(g, st.staff_id);
  since timestamptz := greatest(now() - interval '3 days',
                                to_timestamp(least(greatest(coalesce(p_after, 0), 0), 32503680000000)::double precision / 1000));
begin
  return jsonb_build_object('ok', true, 'alerts', coalesce((
    select jsonb_agg(public._alert_json(x) order by x.created_at desc, x.alert_id)
      from (select a.* from public.gym_alerts a
             where a.gym_id = g and a.created_at > since and a.kind <> 'test_alert' and public._alert_visible(v, a)
             order by a.created_at desc, a.alert_id limit 50) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------------ 0076's HQ calls: a test goes to its one browser
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
    for s in select w.* from public.gym_web_push w
              where w.gym_id = a.gym_id and (a.sub_id is null or w.sub_id = a.sub_id) order by w.created_at loop
      if a.kind = 'test_alert' then
        mine := mine || jsonb_build_array(public._web_push_item(s, 'MettleUp: test alert', a.line, a.route,
                                                               'mettleup-test-' || a.alert_id));
        k := k + 1;
      elsif public._alert_visible(public._alert_viewer(a.gym_id, s.staff_id), a) then
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
             where a.sent_at is null and a.created_at > now() - interval '8 days' and a.kind <> 'test_alert'
               and exists (select 1 from public.gym_web_push p where p.gym_id = a.gym_id)
             group by a.gym_id
             limit 500) w
      left join public.gym_alert_settings s on s.gym_id = w.gym_id
     where coalesce(s.mode, 'daily') <> 'instant'), '[]'::jsonb));
end $$;

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
  -- A test alert is never part of a summary (it goes at once, to its own browser).
  select array_agg(alert_id) into ids from public.gym_alerts
   where gym_id = p_gym and sent_at is null and created_at < slot and kind <> 'test_alert';
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

-- ------------------------------------------------------------------ grants
revoke all on function public._test_alert_sub(text, text) from public, anon, authenticated;
revoke all on function public._test_alert_wait(public.gym_web_push) from public, anon, authenticated;
revoke all on function public.owner_send_test_alert(text, text) from public;
revoke all on function public.owner_test_alert(text, text) from public;
revoke all on function public.panel_test_alert_shown(uuid) from public;
grant execute on function public.owner_send_test_alert(text, text) to anon, authenticated;
grant execute on function public.owner_test_alert(text, text) to anon, authenticated;
grant execute on function public.panel_test_alert_shown(uuid) to anon, authenticated;
-- Restated as 0075 / 0076 left them.
revoke all on function public.owner_alerts(text, bigint) from public;
grant execute on function public.owner_alerts(text, bigint) to anon, authenticated;
revoke all on function public.hq_panel_push_instant(int) from public, anon, authenticated;
revoke all on function public.hq_panel_digest_gyms() from public, anon, authenticated;
revoke all on function public.hq_panel_digest_claim(uuid, bigint, int) from public, anon, authenticated;
grant execute on function public.hq_panel_push_instant(int) to service_role;
grant execute on function public.hq_panel_digest_gyms() to service_role;
grant execute on function public.hq_panel_digest_claim(uuid, bigint, int) to service_role;

notify pgrst, 'reload schema';
