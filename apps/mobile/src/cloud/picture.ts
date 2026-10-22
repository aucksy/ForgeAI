/** R-55: where a saved gym logo or shop photo is loaded from (our address when it is Supabase's; cloud/address.ts). */
import { viaOurAddress } from './address';

let bases: { direct: string; proxy: string } | null | undefined;

/** The two addresses from app.json, read on first use (the config needs the phone's native side). */
function addresses(): { direct: string; proxy: string } | null {
  if (bases !== undefined) return bases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const c = require('./config') as typeof import('./config');
    bases = { direct: c.SUPABASE_URL, proxy: c.SUPABASE_PROXY_URL };
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
  return a ? viaOurAddress(url, a.direct, a.proxy) : url;
}
