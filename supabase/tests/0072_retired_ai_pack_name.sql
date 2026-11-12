-- F201: the retired 'ai' pack is named "Pro" (0072). Runs in CI after every migration (scripts/ci/db_checks.sh); can
-- also be pasted into the live SQL Editor. It ALWAYS ends in an error:
--   "RESULT PASS (n checks)"  - everything worked; nothing was written;
--   "RESULT FAIL: ..."         - the checks that failed (label:what came back).

do $$
declare
  fails text := ''; checks int := 0;
  w text;
begin
  -- The names receipts and payment descriptions use.
  for w in select x from (values ('starter:Starter'), ('pro:Pro'), ('ai:Pro')) v(x) loop
    checks := checks + 1;
    if public._plan_word(split_part(w, ':', 1)) is distinct from split_part(w, ':', 2) then
      fails := fails || ' name_' || split_part(w, ':', 1) || ':' || coalesce(public._plan_word(split_part(w, ':', 1)), 'null');
    end if;
  end loop;
  checks := checks + 1;
  if public._plan_word(null) <> '' then fails := fails || ' name_null'; end if;
  -- No plan word anywhere reads like the old third pack.
  checks := checks + 1;
  if exists (select 1 from (values ('starter'), ('pro'), ('ai')) v(p) where public._plan_word(p) ilike '%+%ai%') then
    fails := fails || ' old_name_still_there';
  end if;
  -- 'ai' stays a valid plan word for old rows (0030's check is unchanged), and is still not on sale (0060).
  checks := checks + 1;
  if public._mettleup_price('ai', 'monthly') is not null or public._mettleup_price('ai', 'yearly') is not null then
    fails := fails || ' ai_priced';
  end if;
  checks := checks + 1;
  if not exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                  where t.relname = 'gyms' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%''ai''%') then
    fails := fails || ' ai_word_dropped';
  end if;
  -- Nobody but the server may call the helper.
  checks := checks + 1;
  if has_function_privilege('authenticated', 'public._plan_word(text)', 'execute')
     or has_function_privilege('anon', 'public._plan_word(text)', 'execute') then
    fails := fails || ' helper_callable';
  end if;

  if fails = '' then
    raise exception 'RESULT PASS (% checks)', checks;
  end if;
  raise exception 'RESULT FAIL:%', fails;
end $$;
