import { getSupabase } from '@/cloud/client';
import { getIdentity, isCloudActive } from '@/cloud/session';
import { buildMemberSummary } from '@/cloud/summary';
import { getDb, getMeta, setMeta } from '@/db';
import { uuid } from '@/lib/uuid';

/**
 * Device-monotonic version for the server-side regression guard. Persisted in
 * `meta` so it never goes backwards across app restarts or a backward wall-clock
 * (NTP/manual) correction — a raw Date.now() could otherwise freeze cloud state.
 */
async function nextClientVersion(): Promise<number> {
  const stored = Number((await getMeta('cloud_client_version')) ?? '0');
  const next = Math.max(stored + 1, Date.now());
  await setMeta('cloud_client_version', String(next));
  return next;
}

/**
 * One-way push outbox. We keep at most ONE snapshot row (the latest): enqueue
 * clears the table and inserts a fresh `pending` row, so we never push stale
 * data and the server-side client_version guard is belt-and-braces. drain()
 * upserts it under the member's RLS. No pull, no merge, no tombstones.
 */

/** R-630: the age rule, loaded late (copySync pulls in much of the app). Any failure reads as not under 18, as there. */
async function under18(): Promise<boolean> {
  const { profileUnder18 } = await import('@/cloud/copySync');
  return profileUnder18();
}

export async function enqueueSummary(): Promise<void> {
  if (!(await isCloudActive())) return;
  // R-630: nothing of a member under 18 goes to the server, the gym summary included.
  if (await under18()) return;
  const identity = await getIdentity();
  if (!identity) return;
  const row = await buildMemberSummary(identity.displayName);
  const clientVersion = await nextClientVersion();
  const db = getDb();
  await db.runAsync('DELETE FROM sync_outbox'); // keep only the latest snapshot
  await db.runAsync(
    `INSERT INTO sync_outbox(id, kind, payload, status, client_version, attempts, updated_at)
     VALUES(?, 'member_summary', ?, 'pending', ?, 0, ?)`,
    [uuid(), JSON.stringify(row), clientVersion, Date.now()],
  );
}

export async function drainOutbox(): Promise<void> {
  if (!(await isCloudActive())) return;
  if (await under18()) {
    await getDb().runAsync('DELETE FROM sync_outbox'); // a summary queued before the age changed never leaves
    return;
  }
  const identity = await getIdentity();
  if (!identity) return;

  const db = getDb();
  const rows = await db.getAllAsync<{ id: string; payload: string; client_version: number }>(
    "SELECT id, payload, client_version FROM sync_outbox WHERE status <> 'synced' ORDER BY client_version ASC",
  );
  if (rows.length === 0) return;

  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return; // linked but not authenticated → leave pending for re-login

  for (const rec of rows) {
    try {
      const summary = JSON.parse(rec.payload) as Record<string, unknown>;
      const { error } = await sb.from('member_summary').upsert(
        {
          member_id: identity.memberId,
          gym_id: identity.gymId,
          client_version: rec.client_version,
          consent_version: identity.consentVersion,
          updated_at: new Date().toISOString(),
          ...summary,
        },
        { onConflict: 'member_id' },
      );
      if (error) throw new Error(error.message);
      await db.runAsync("UPDATE sync_outbox SET status = 'synced', updated_at = ? WHERE id = ?", [
        Date.now(),
        rec.id,
      ]);
    } catch (e) {
      await db.runAsync(
        "UPDATE sync_outbox SET status = 'error', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?",
        [e instanceof Error ? e.message.slice(0, 200) : 'push failed', Date.now(), rec.id],
      );
    }
  }
  await db.runAsync("DELETE FROM sync_outbox WHERE status = 'synced'");
}
