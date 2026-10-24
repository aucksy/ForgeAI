// HQ's door to the gym server (Supabase). Only the hq_* functions (migrations 0026-0028, 0030), only with
// the Worker secret SUPABASE_HQ_KEY (a Supabase secret key named "hq"; it reaches the database as
// service_role, the only role the hq_* functions are granted to). The key never leaves this Worker:
// it is not logged, not echoed, and never sent to the browser.

export class DbError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'DbError';
    this.code = code;
    this.status = status;
  }
}

/** The refusal word a function raised (BAD_PHONE, SUSPENDED, ...), or UNKNOWN. PURE. */
export function refusalCode(message) {
  const m = /^([A-Z][A-Z_]{2,29})\b/.exec(String(message || ''));
  return m ? m[1] : 'UNKNOWN';
}

/**
 * POST /rest/v1/rpc/<fn>. clientIp goes in x-hq-client-ip, which the audit log keeps.
 * -> the JSON answer; throws DbError(code) on a refusal or an outage.
 */
export async function rpc(env, fn, args, { fetchImpl = fetch, clientIp = '' } = {}) {
  if (!/^hq_[a-z_]+$/.test(fn)) throw new DbError('INVALID', 400);
  let res;
  try {
    res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_HQ_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-hq-client-ip': String(clientIp || '').slice(0, 64),
      },
      body: JSON.stringify(args ?? {}),
    });
  } catch (e) {
    console.error(`[hq-db] ${fn} unreachable`, e instanceof Error ? e.message : 'error');
    throw new DbError('OFFLINE', 503);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = '';
    let pgCode = '';
    try {
      const body = JSON.parse(text);
      message = body.message || '';
      pgCode = body.code || '';
    } catch {
      message = ''; // quiet: a non-JSON error page; logged below with its status
    }
    // The function is not on the server yet (its migration is waiting for the owner's yes, e.g. 0030):
    // PostgREST answers 404 PGRST202. The page says "needs the database update", never "broken".
    if (pgCode === 'PGRST202') {
      console.warn(`[hq-db] ${fn} is not on the gym server yet (migration not applied)`);
      throw new DbError('NOT_READY', 400);
    }
    const code = refusalCode(message);
    if (code === 'UNKNOWN') console.error(`[hq-db] ${fn} answered ${res.status}`, text.slice(0, 300));
    throw new DbError(code, res.status >= 500 ? 503 : res.status === 401 || res.status === 403 ? 503 : 400);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[hq-db] ${fn} answer was not JSON`, e instanceof Error ? e.message : 'error');
    throw new DbError('UNKNOWN', 503);
  }
}
