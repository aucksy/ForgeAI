-- APPLIED LIVE 14 Nov 2026 (owner: "yes to the 12-month database change"); live tests 0084 PASS 22, 0053 PASS 68. Re-runnable. Apply after 0053.
-- Test: supabase/tests/0084_progress_year.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing). Plan and numbers: docs/progress/SINCE-JOINING.md.
--
-- 0084: R-537 (owner, 14 Nov 2026): "the graph that the admin user will see is a line graph ... And it should be at
-- least last one year since they joined the app." The gym's Training progress reads up to 12 months of a member's
-- workouts, not 3 months.
--
-- Additive: one new function the phone calls, one helper. No new table or column, no change to any existing function.
--   member_trainer_share3(key, summary, recent) {ok, on: true}; INVALID, SUSPENDED, BAD_KEY
--     The same as 0053's member_trainer_share2, with the limits raised for a year of workouts:
--       recent: [{"d":"YYYY-MM-DD", "n": workout name, "x":[{"n": exercise name, "w": best kg, "r": reps of that set,
--                "s": working sets}]}]   at most 400 workouts, last 366 days (India), at most 20 exercises each,
--                at most 300000 characters (a heavy year is about 165000; the phone keeps itself under 280000).
--     Checked and rebuilt with only those fields (_trainer_year_clean): never notes, photos, body weight, food, or a
--     list of every set. Workouts older than 366 days or more than a day ahead are dropped, not refused.
--     Kept in gym_progress_summaries.recent, exactly where 0053 keeps 3 months, so owner_member_progress (0053)
--     already gives it to the owner, or to the ticked trainer that member is assigned to, and to nobody else.
--   Deleting stays exactly as 0050 / 0053: at once on "off" (member_trainer_stop), at once on leaving the gym
--   (gym_members_trainer_left), and on the next read when nothing new came for 90 days.
--   Older phones keep calling member_trainer_share2 (3 months, 30 workouts): nothing changes for them.
--   A phone that finds no member_trainer_share3 (PGRST202, this file not applied) sends 3 months the 0053 way.
--
-- Size (docs/progress/SINCE-JOINING.md): about 70 KB of text per member for a year at 4 workouts a week with 6
-- exercises, 165 KB at 6 a week with 10; Postgres compresses it (TOAST) to roughly a third on disk. One row per
-- member, replaced on every share, so it never grows past one year.
--
-- Undo: drop function public.member_trainer_share3(text, jsonb, jsonb); drop function public._trainer_year_clean(jsonb);
-- (the rows it wrote stay readable by 0053 and are replaced by the next 3-month share).

create or replace function public._trainer_year_clean(p jsonb) returns jsonb
  language plpgsql stable set search_path = public as $$
declare
  e jsonb; x jsonb; ex jsonb; d date; kept jsonb[] := '{}';
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'::jsonb; end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 400 or length(p::text) > 300000 then
    raise exception 'INVALID';
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'x') is distinct from 'array'
       or jsonb_array_length(e->'x') > 20 then
      raise exception 'INVALID';
    end if;
    d := public._tv_day(e->'d');
    ex := '[]'::jsonb;
    for x in select value from jsonb_array_elements(e->'x') loop
      if jsonb_typeof(x) is distinct from 'object' then raise exception 'INVALID'; end if;
      ex := ex || jsonb_build_array(jsonb_build_object('n', public._tv_name(x->'n'), 'w', public._tv_kg(x->'w'),
              'r', public._tv_int(x->'r', 0, 1000), 's', public._tv_int(x->'s', 0, 100)));
    end loop;
    if d >= today - 366 and d <= today + 1 then
      kept := kept || jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'n', public._tv_wname(e->'n'), 'x', ex);
    end if;
  end loop;
  -- Newest first.
  return coalesce((select jsonb_agg(w order by w->>'d' desc) from unnest(kept) w), '[]'::jsonb);
end $$;

create or replace function public.member_trainer_share3(p_key text, p_summary jsonb, p_recent jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.gym_members := public._member(p_key); c jsonb; rc jsonb; link jsonb;
begin
  c := public._trainer_clean(p_summary);
  rc := public._trainer_year_clean(p_recent);
  if exists (select 1 from public.gyms where gym_id = m.gym_id and status = 'suspended') then raise exception 'SUSPENDED'; end if;
  link := public._member_roster_link(p_key);
  insert into public.gym_progress_summaries(member_id, gym_id, roster_id, summary, recent, updated_at)
    values (m.member_id, m.gym_id, link->>'rosterId', c, rc, now())
  on conflict (member_id) do update
    set gym_id = excluded.gym_id, roster_id = excluded.roster_id, summary = excluded.summary,
        recent = excluded.recent, updated_at = now();
  return jsonb_build_object('ok', true, 'on', true);
end $$;

revoke all on function public._trainer_year_clean(jsonb) from public, anon, authenticated;
revoke all on function public.member_trainer_share3(text, jsonb, jsonb) from public;
grant execute on function public.member_trainer_share3(text, jsonb, jsonb) to anon, authenticated;
