/** R-55: where a saved gym logo or shop photo is loaded from (our address in use when it is Supabase's; cloud/address.ts). */
import { viaOurAddress } from './address';

let bases: { direct: string; proxies: readonly string[] } | null | undefined;

/** The addresses from app.json, read on first use (the config needs the phone's native side). */
function addresses(): { direct: string; proxies: readonly string[] } | null {
  if (bases !== undefined) return bases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const c = require('./config') as typeof import('./config');
    bases = { direct: c.SUPABASE_URL, proxies: c.SUPABASE_PROXY_URLS };
  } catch {
    // quiet: no app config (pure unit tests): a picture loads from its saved link, as before R-55.
    bases = null;
  }
  return bases;
}

export function pictureUrl(url: string): string;
export function pictureUrl(url: string | null | undefined): string | null | undefined;
export function pictureUrl(url: string | null | undefined): string | null | undefined {
  const a = addresses();
  return a ? viaOurAddress(url, a.direct, a.proxies) : url;
}
