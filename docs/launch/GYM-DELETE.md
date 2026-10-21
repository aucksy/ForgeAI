# Deleting a gym from ForgeAI (launch D8) — 21 Oct 2026

A gym owner asks from the admin app: **Settings → Your data → Delete our gym from ForgeAI**. The
request lands in the feedback box (`python scripts/feedback.py new` shows it as
`DELETE REQUEST: gym "<name>", code <CODE>, gym phone <number>, asked by <person>`). The button deletes
nothing. The privacy notice promises: deleted within 30 days; backups expire within 7 more days.

This is a **LIVE database change**: it runs only with the ForgeAI owner's yes, every time.

## Steps
1. **Check it is real.** Call the gym's own number (from the request AND from the gym's record, not
   a number written in the message). The gym's owner confirms by voice. A request from a Staff
   person is not enough: the gym owner must confirm.
2. **Remind them to download first** (Settings → Your data → Download all your gym's data). After
   step 4 nothing can be brought back.
3. **Owner's yes in chat**, then mark the request: `python scripts/feedback.py mark <id> done "deleting, confirmed by call <date>"`.
4. **Supabase dashboard → SQL editor** (the dashboard tab only, never a script with a key):
   ```sql
   begin;
   -- 1. Exactly one gym, the right one:
   select gym_id, name, join_code, created_at from public.gyms where join_code = '<CODE>';
   -- 2. Delete it. Every gym table follows by itself (on delete cascade); staff and member
   --    profiles keep their account but lose the gym link (on delete set null).
   delete from public.gyms where join_code = '<CODE>' returning gym_id, name;
   -- 3. Proof: no table still holds a row for that gym id.
   do $$
   declare t record; n bigint;
   begin
     for t in select table_name from information_schema.columns
              where table_schema = 'public' and column_name = 'gym_id' loop
       execute format('select count(*) from public.%I where gym_id = %L', t.table_name, '<GYM_ID>') into n;
       if n > 0 then raise exception 'still % rows in %', n, t.table_name; end if;
     end loop;
   end $$;
   commit;
   ```
   If step 3 raises, the whole block is undone (nothing deleted): find the table, and fix the cause
   before trying again.
5. **Pictures:** Supabase dashboard → Storage → `gym-logos` and `product-photos` → delete the folder
   named with the gym id (Supabase does not allow deleting stored files from SQL).
6. **Cloudflare:** `python scripts/feedback.py all` → mark this gym's other messages `done`; they are
   purged with everything else after 1 year.
7. **Tell the gym** it is done (WhatsApp or call), and write the date in docs/CLAUDE-NOTES.md.

## A gym that only used the admin app in a browser (never online)
Nothing of it is on the server. Settings → Erase and start fresh removes it from that browser.
