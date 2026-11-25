# B-words-panel-ui-shell checkpoint

## Progress
- started 26 Nov 2026; scope: top-level files in apps/dashboard/src/crm/ui (screens/ and forms/ belong to other areas).
- H10.10-H10.13 checked: tap handler sw.js:175-194 + NeedsYou.tsx:140-151; server routes (0075 etc) all known to CrmApp.tsx:391-512; icons current brand, badge one-colour.
- L10.1 Hinglish: files with no t(): BusinessGrowth, OwnerNumbers, offline, InstallCard, MemberCardSheet, ForgeAccessCard, GymDataActions, WhatsAppSheet, SendQueueSheet, ThemeToggle, DisplayMenu, BillingOnline, TrialBanner, LapseBanner.
- H10.6/7/14 checked: AlertsCards.tsx:370-373 Save grey with no "saved" until a save this visit (new finding). Others have reasons (WhatsAppSheet:100-106, QuickActions:102).
- H10.8/9 checked: bottom bar ellipsis AppShell.tsx:522-530, Button wrap kit.tsx:478-480, refresh bubble wraps; no new fault.
- Member card: says show it at the desk, but no scan and no search by card number (new finding).
- L10.1 + H10.1-H10.16 done: findings 01-04 (01 S4 Hinglish, 02 S3 member card, 03 S4 save, 04 S4 notice icon); reused A5-server-database-1-3-01, A3-notes-claude-1-01, B-words-panel-forms-01, L14-01/-04, B-truth-a-01, L9-01/-04, brand-shell-03, logic-2-04, B-words-hq-app-06.
- lens-cover ok; merge --dry 6 rows, 0 rejected. Code lines read ~1,100.
DONE.
