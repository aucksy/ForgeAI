// R-506 (supabase 0076): make the HQ Worker's Web Push key ONCE and hand it straight to Cloudflare, never on screen.
// From the repo root:
//   node scripts/vapid-keygen.mjs | npx wrangler secret put VAPID_PRIVATE_JWK --config deploy/hq/wrangler.jsonc
// stdout: the private key (a P-256 JWK, one line) for the pipe. stderr: only the PUBLIC key, to check later that
// https://hq.mettleup.fit/push/web-key answers the same. Never run it again once set: every browser that turned
// alerts on is tied to this key (a new key = everyone turns alerts on again).
// Refuses to print the private key to a screen (stdout must be a pipe or a file).

import { webPushPublicKey } from '../deploy/hq/webpush.js';

if (process.stdout.isTTY) {
  console.error('Pipe this into wrangler (see the top of this file); the private key is never shown on screen.');
  process.exit(1);
}
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const key = { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y };
process.stdout.write(JSON.stringify(key));
console.error(`Public key (safe to share): ${webPushPublicKey(key)}`);
