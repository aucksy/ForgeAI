-- 0009: gym messages review fixes (14 Oct 2026), on top of 0008.
--  1. "Take back" no longer frees the offer cap: an offer or event taken back still counts, unless it
--     was taken back within 10 minutes of sending (the typo case). Before, send → take back → send
--     again could put up to 20 offers a day in front of members.
--  2. Two sends at the same moment (two panel tabs, two staff) are queued on the gym's row, so both
--     cannot pass the caps.
--  3. "Seen by x of y": x now counts only members it was sent to (joined before it went), the same
--     group as y. Members who joined later still see it in their inbox, but are not counted.

create or replace function public.owner_send_message(p_key text, p_kind text, p_title text, p_body text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public._owner_gym(p_key);
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  n int;
  m public.gym_messages;
begin
  if p_kind not in ('announcement','closed','timing','offer','event','reminder') then raise exception 'BAD_KIND'; end if;
  if length(t) = 0 then raise exception 'EMPTY'; end if;
  if length(t) > 60 or length(b) > 300 then raise exception 'TOO_LONG'; end if;
  -- One send at a time per gym: the counts below and the insert see each other.
  perform 1 from public.gyms where gym_id = g for update;
  select count(*) into n from public.gym_messages where gym_id = g and created_at >= today_start;
  if n >= 20 then raise exception 'TOO_MANY'; end if;
  if p_kind in ('offer','event') then
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and created_at >= today_start
        and (withdrawn_at is null or withdrawn_at > created_at + interval '10 minutes');
    if n >= 1 then raise exception 'OFFER_TODAY'; end if;
    select count(*) into n from public.gym_messages
      where gym_id = g and kind in ('offer','event') and created_at >= today_start - interval '6 days'
        and (withdrawn_at is null or withdrawn_at > created_at + interval '10 minutes');
    if n >= 3 then raise exception 'OFFER_WEEK'; end if;
  end if;
  select count(*) into n from public.gym_members where gym_id = g and left_at is null;
  insert into public.gym_messages(gym_id, kind, title, body, recipients)
    values (g, p_kind, t, b, n) returning * into m;
  return public._message_json(m) || jsonb_build_object('recipients', m.recipients, 'seen', 0, 'withdrawn', false);
end $$;

create or replace function public.owner_messages(p_key text)
  returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select m.created_at,
           public._message_json(m) || jsonb_build_object(
             'recipients', m.recipients,
             'seen', (select count(*) from public.gym_message_seen s
                        join public.gym_members mem on mem.member_id = s.member_id
                       where s.message_id = m.message_id and mem.joined_at <= m.created_at),
             'withdrawn', m.withdrawn_at is not null) as j
    from public.gym_messages m
    where m.gym_id = public._owner_gym(p_key)
    order by m.created_at desc
    limit 100) x
$$;
