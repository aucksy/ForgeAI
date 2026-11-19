# A4-nocaller-1 checkpoint
Finished units (candidate numbers are lines 1166-1261 of readers-raw.txt, counted from 1):
- 1-15 done (rows RD-A4-nocaller-1-01 to -15 written)
- 16-30 done (rows -16 to -30 written)
- 31-45 done (rows -31 to -45 written)
- 46-62 done (rows -46 to -62 written)
- 63-79 done (rows -63 to -79 written; entity row E-gym-member-days written)
- 80-96 done (rows -80 to -96 written)

## seen in passing
- AI wallet says the low mark is 5 credits (supabase/migrations/0071_ai_assistant.sql:204) but the low-credit alert fires at 10 (supabase/migrations/0083_ai_members.sql:93). Two different numbers for the same idea; not checked which one a screen shows.
- Gym page photo read rule (supabase/migrations/0082_gym_page_photos.sql:103-110) checks "not taken down by HQ" and "gym not paused" but not whether the page is published. A photo of an unpublished page may stay readable by its direct address. Not checked against later migrations or the Worker.
- Functions that nothing at all calls: none. All 96 are called by a trigger, another database function or a storage rule.

## could not check
- Whether each trigger is still attached in the live database (read from migration files only; no catalog query run).
- Caller search covered supabase/migrations and deploy/ only, by name.

ALL 96 DONE.
