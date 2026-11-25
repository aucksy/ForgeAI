# B-switch-panel-brand-shell-a checkpoint

## Done
- 2026-11-26 H1.1-H1.4 (gap-1) checked. Switches: brand look (colour, tone, logo, heading), Pro lock (off), member app off card, go back to MettleUp's look, set-up step tick, hourly app check. Readers: member app theme + shortcut (read the Pro lock, wait for no workout), web page, invite/join, phone sign-in, branches, admin header, AI help.
- 2 new findings: 01 S4 public pages/header/branches ignore the Pro lock for the look; 02 S3 Branding saves one branch only, silently.
- lens-cover ok; merge --dry 3/3 passed.
- Not a finding: set-up step stays ticked after going back to MettleUp's look (one-time onboarding tick by design); colour suggestion clears when the logo is removed (BrandingScreen.tsx:213).
