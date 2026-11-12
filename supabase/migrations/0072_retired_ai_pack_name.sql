-- NOT APPLIED — needs the owner's yes ("No LIVE database change without my yes"). Paste into the Supabase SQL Editor
-- after 0071 (it needs 0063, which made the function it replaces). Re-runnable. Test:
-- supabase/tests/0072_retired_ai_pack_name.sql (CI runs it after every migration; pasted into the SQL Editor it always
-- ends in an error and so changes nothing).
--
-- 0072: F201 (12 Nov 2026, 03-design.md section 8). The old third pack, plan word 'ai', is retired: the AI Assistant
-- is sold as AI credits on every plan instead (0071). The word stays valid everywhere (gyms.plan, 0030's check, the
-- 0060 / 0062 tables) because old rows and old migrations use it, and a gym on 'ai' is treated as Pro (0062 gives it
-- exactly Pro's features). What changes: the plan's NAME on receipts and payment descriptions. 0063's _plan_word
-- gave 'ai' the old pack's name; from here it is "Pro", the same name the admin app and HQ now show.
--
-- CHANGES one private helper (public._plan_word, from 0063) and nothing else: no table, column, row or grant.
-- Undo: paste 0063's _plan_word again.

create or replace function public._plan_word(p_plan text) returns text
  language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 'Starter' when 'pro' then 'Pro' when 'ai' then 'Pro' else coalesce(p_plan, '') end
$$;

revoke all on function public._plan_word(text) from public, anon, authenticated;
