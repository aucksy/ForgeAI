# L19-phone-cloud-backup-ai checkpoint
- L19.1 done: findings 01, 03; reuse FN-L3-server-database-1-01 (join code guessing, phone join behind switch). Checked: copy is per-account (RLS + security definer), not read by gyms; backup restore paths safe (safeId, stored-only ZIP, CRC); AI keys in SecureStore and are the member's own (no gym credits).
- L19.2 done: finding 02 (coach off; gym-plan text reaches AI unfenced; deletes prompt-guarded only).
