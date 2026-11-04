// The nightly backup of the gym data (launch audit 3 Nov 2026, ops #1 / owner #1). Runs inside HQ's existing
// 03:00 India-time Cron Trigger (worker.js scheduled), BEFORE the nightly clean-up, so the copy still holds what
// the clean-up removes. No new account, no new secret, no paid feature:
//   - the read: ONE call to hq_backup_snapshot() (migration 0052) with the HQ key this Worker already holds
//     (SUPABASE_HQ_KEY, service_role). One call = one consistent copy, and it stays inside the free plan's
//     50 outside calls per run.
//   - the store: Cloudflare KV, binding BACKUP (free plan: 1 GB stored, 1,000 writes a day, 25 MiB a value).
//     The answer is stored byte for byte, never parsed or compressed here: the free plan gives a run 10 ms
//     of CPU, and copying bytes costs almost none. A copy bigger than one KV value is split into parts.
//   - 7 days: every key is written with a 7-day expiry (the privacy page and gym agreement promise backups expire within 7 days; owner, 4 Nov 2026), so KV deletes old copies by itself (no clean-up code).
// Keys:   snap/<India day>/part/<n>   the copy, in order (join the parts to get the JSON back)
//         snap/<India day>/meta       { format, at, bytes, parts }  written LAST: no meta = an unfinished copy
//         status                      the last run: { ok, at, error?, lastGoodAt, lastGoodDay, bytes }
// Restore: scripts/backup/restore.mjs; the drill: docs/BACKUP-RESTORE.md.
// Without the BACKUP binding (KV namespace not created yet) it logs once and does nothing else.

export const PART_BYTES = 20 * 1024 * 1024; // under KV's 25 MiB value limit
export const KEEP_SECONDS = 7 * 24 * 60 * 60; // 7 nightly copies; never longer than the 7 days the privacy page promises
export const FRESH_HOURS = 30; // the watch calls a backup "late" after this (nightly + 6 h of slack)

/** The India calendar day of a moment, YYYY-MM-DD. PURE. */
export function indiaDay(now) {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Cut a stream of bytes into parts of at most `size` bytes, without looking inside them. */
export async function readParts(stream, size = PART_BYTES) {
  const parts = [];
  let cur = new Uint8Array(size);
  let used = 0;
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let off = 0;
    while (off < value.length) {
      const n = Math.min(size - used, value.length - off);
      cur.set(value.subarray(off, off + n), used);
      used += n;
      off += n;
      total += n;
      if (used === size) {
        parts.push(cur);
        cur = new Uint8Array(size);
        used = 0;
      }
    }
  }
  if (used > 0 || parts.length === 0) parts.push(cur.slice(0, used));
  return { parts, total };
}

/** The last byte that is not white space, as a character ('' when none). */
function lastChar(parts) {
  for (let p = parts.length - 1; p >= 0; p--) {
    const b = parts[p];
    for (let i = b.length - 1; i >= 0; i--) {
      if (![0x20, 0x0a, 0x0d, 0x09].includes(b[i])) return String.fromCharCode(b[i]);
    }
  }
  return '';
}

/**
 * Take tonight's copy. -> { ok, day, bytes, parts } or { ok: false, error }. Never throws: the clean-up after it
 * must still run. The result is also written to the KV key "status" (read by /backup/status and the watch).
 */
export async function runBackup(env, { fetchImpl = fetch, now = new Date() } = {}) {
  const kv = env.BACKUP;
  if (!kv) {
    console.warn('[backup] off: no BACKUP binding (create the KV namespace: docs/BACKUP-RESTORE.md)');
    return { ok: false, error: 'NOT_SET_UP' };
  }
  const day = indiaDay(now);
  const at = now.toISOString();
  let prev = {};
  try {
    prev = (await kv.get('status', 'json')) || {};
  } catch {
    prev = {}; // quiet: a missing or broken status only loses "last good", which this run rewrites
  }
  const fail = async (error) => {
    console.error('[backup] failed:', error);
    const status = { ok: false, at, error, lastGoodAt: prev.lastGoodAt || null, lastGoodDay: prev.lastGoodDay || null, bytes: prev.bytes || 0 };
    try {
      await kv.put('status', JSON.stringify(status));
    } catch (e) {
      console.error('[backup] status not written', e instanceof Error ? e.message : 'error');
    }
    return { ok: false, error };
  };

  let res;
  try {
    res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/hq_backup_snapshot`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_HQ_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
  } catch (e) {
    return fail(`gym server unreachable (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`);
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    // PGRST202: migration 0052 is not on the gym server yet.
    return fail(/PGRST202/.test(text) ? 'NOT_READY: migration 0052 not applied' : `gym server answered ${res.status}`);
  }
  let parts;
  let total;
  try {
    ({ parts, total } = await readParts(res.body));
  } catch (e) {
    return fail(`copy cut short (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`);
  }
  // The answer is one JSON object: it must end in "}". Anything else is a cut-off or an error page.
  if (total < 20 || lastChar(parts) !== '}') return fail(`copy looks incomplete (${total} bytes)`);

  try {
    for (let i = 0; i < parts.length; i++) {
      await kv.put(`snap/${day}/part/${i}`, parts[i], { expirationTtl: KEEP_SECONDS });
    }
    const meta = { format: 'mettleup-backup-1', at, bytes: total, parts: parts.length };
    await kv.put(`snap/${day}/meta`, JSON.stringify(meta), { expirationTtl: KEEP_SECONDS });
    await kv.put('status', JSON.stringify({ ok: true, at, lastGoodAt: at, lastGoodDay: day, bytes: total }));
  } catch (e) {
    return fail(`could not store the copy (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`);
  }
  console.log('[backup] stored', JSON.stringify({ day, bytes: total, parts: parts.length }));
  return { ok: true, day, bytes: total, parts: parts.length };
}

/**
 * GET /backup/status, no sign-in: only whether last night's copy worked and when. No gym data, no sizes.
 * The watch workflow (scripts/watch/outage.mjs) reads it every run and opens an issue when it is late.
 */
export async function backupStatus(env, now = new Date()) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (!env.BACKUP) return new Response(JSON.stringify({ setUp: false, fresh: false }), { status: 200, headers });
  let s = null;
  try {
    s = await env.BACKUP.get('status', 'json');
  } catch {
    s = null; // quiet: reported as "not fresh" below
  }
  // Just deployed, no night yet: remember when we were first asked, and give the first copy the same 30 hours
  // (so the watch does not alarm on the day of the deploy, but does if the nightly run never happens).
  if (!s) {
    s = { ok: null, waitingSince: now.toISOString() };
    try {
      await env.BACKUP.put('status', JSON.stringify(s));
    } catch {
      // quiet: asked again on the next watch run
    }
  }
  const lastGoodAt = s.lastGoodAt || null;
  const since = lastGoodAt || s.waitingSince || null;
  const hours = since ? (now.getTime() - Date.parse(since)) / 3_600_000 : null;
  const body = {
    setUp: true,
    lastRunOk: s.ok === true ? true : s.ok === false ? false : null,
    lastGoodAt,
    fresh: hours !== null && hours <= FRESH_HOURS,
  };
  return new Response(JSON.stringify(body), { status: 200, headers });
}
