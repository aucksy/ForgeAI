-- APPLIED LIVE 30 Oct 2026 (owner: "Yes, switch on 0041 so receipts printed offline are never refused"; live test PASS 18).
-- 0041: a receipt printed at a desk with NO internet is never refused for "more than this member owes".
-- Apply after 0040. Re-runnable (create or replace). Changes no saved row; only 0021's _receipt_ok.
-- Test: supabase/tests/0041_offline_desk_receipts.sql (CI runs it after every migration).
--
-- Why: the admin app keeps working with no internet (apps/dashboard/src/crm/data/outbox.ts). A desk
-- that takes money offline prints a receipt from its OWN series (logic/receipts.ts offlineReceiptNo:
-- 2026-27/D1-0001, a branch B2/26-27/D1-0001), claimed once while online as the enquiry record
-- "deskseries-<n>". If another desk took money for the same plan meanwhile, the second receipt
-- reaches the server as more than the plan still owes, and 0021 refuses it (OVER_DUE). But the cash
-- WAS taken and the receipt WAS printed and handed over: it cannot be refused or renumbered. Today
-- the panel keeps it on the desk device and the owner can only save it as a cancelled receipt, which
-- hides real money. With 0041 the server takes it as written (the member has paid ahead), and the
-- panel tells the desk "X has now paid Rs N too much ... Please ask the owner to check".
--
-- Exactly what changes: a NEW receipt skips the OVER_DUE check when ALL hold:
--   1. it says it was taken offline (data.offline = true);
--   2. its number is in a desk's offline series: ends "/D<n>-<4+ digits>";
--   3. desk <n> of THIS gym really claimed its series (an enquiry record "deskseries-<n>" exists).
-- Everything else in 0021 stays: amount, date (TOO_OLD for the desk too), 16 characters, a duplicate
-- number, the right member's plan; a saved receipt is still never edited; the desk's own limits
-- (0018/0019) still come first.

create or replace function public._receipt_ok(p_gym uuid, p_id text, p_new jsonb, p_is_staff boolean)
  returns void language plpgsql stable set search_path = public as $$
declare
  prev jsonb; gone boolean; ms jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  amt numeric; day date; no text; paid numeric; desk text;
begin
  select data, deleted into prev, gone from public.crm_records where gym_id = p_gym and kind = 'payment' and id = p_id;

  if prev is not null then
    -- The same receipt again (a resend): fine. Who took it is the server's to keep (0019).
    if (prev - 'collectedBy' - 'collectedByName') = (p_new - 'collectedBy' - 'collectedByName') then return; end if;
    -- The one change a saved receipt takes: a cancel, with a reason. Nothing else, by anyone.
    if not gone
       and coalesce(prev->>'voided', 'false') <> 'true'
       and p_new->>'voided' = 'true'
       and (prev - 'collectedBy' - 'collectedByName' - 'voided' - 'voidReason')
         = (p_new - 'collectedBy' - 'collectedByName' - 'voided' - 'voidReason') then
      if length(btrim(coalesce(p_new->>'voidReason', ''))) < 3 then raise exception 'NEED_REASON'; end if;
      return;
    end if;
    raise exception 'RECEIPT_LOCKED';
  end if;

  -- A new receipt.
  if jsonb_typeof(p_new->'amountP') is distinct from 'number' then raise exception 'BAD_AMOUNT'; end if;
  amt := (p_new->>'amountP')::numeric;
  if amt <= 0 or amt <> trunc(amt) then raise exception 'BAD_AMOUNT'; end if;

  day := public._iso_day(p_new->>'paidOn');
  if day is null or day > today then raise exception 'BAD_DATE'; end if;
  if p_is_staff and day < today - 31 then raise exception 'TOO_OLD'; end if;

  no := btrim(coalesce(p_new->>'receiptNo', ''));
  if no = '' or length(no) > 16 then raise exception 'BAD_RECEIPT_NO'; end if;
  if exists (select 1 from public.crm_records
              where gym_id = p_gym and kind = 'payment' and not deleted and id <> p_id
                and btrim(data->>'receiptNo') = no) then
    raise exception 'DUP_RECEIPT';
  end if;

  select data into ms from public.crm_records
   where gym_id = p_gym and kind = 'membership' and id = p_new->>'membershipId' and not deleted;
  if ms is null or (ms->>'memberId') is distinct from (p_new->>'memberId') then raise exception 'WRONG_PLAN'; end if;

  -- What the membership still owes. Not for a receipt saved already cancelled, nor for an owner's
  -- imported receipt (history from an old register).
  if coalesce(p_new->>'voided', 'false') = 'true' then return; end if;
  if not p_is_staff and coalesce(p_new->>'importId', '') <> '' then return; end if;
  -- 0041: nor for a receipt printed offline from a desk series this gym really gave out.
  if p_new->>'offline' = 'true' then
    desk := substring(no from '/D([0-9]{1,4})-[0-9]{4,}$');
    if desk is not null and exists (select 1 from public.crm_records
                                     where gym_id = p_gym and kind = 'enquiry' and id = 'deskseries-' || desk
                                       and not deleted) then
      return;
    end if;
  end if;
  select coalesce(sum(public._num(data->'amountP')), 0) into paid from public.crm_records
   where gym_id = p_gym and kind = 'payment' and not deleted and id <> p_id
     and data->>'membershipId' = p_new->>'membershipId'
     and coalesce(data->>'voided', 'false') <> 'true';
  if amt > public._num(ms->'priceP') + public._num(ms->'joiningFeeP') - paid then
    raise exception 'OVER_DUE';
  end if;
end $$;

revoke all on function public._receipt_ok(uuid, text, jsonb, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
