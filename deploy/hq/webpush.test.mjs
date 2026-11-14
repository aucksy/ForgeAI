// node --test deploy/hq  (CI: ci.yml "HQ Worker tests"). R-506 phase 3: Web Push encryption and signing (webpush.js),
// checked against the worked example of RFC 8291 (section 5 and Appendix A), byte for byte.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { b64u, encryptPayload, fromB64u, readVapidKey, sendWebPush, vapidAuthorization, webPushPublicKey } from './webpush.js';

// RFC 8291 section 5 / Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function jwkFrom(d, publicRaw) {
  const pub = fromB64u(publicRaw);
  return { kty: 'EC', crv: 'P-256', d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) };
}

test('RFC 8291 example: the same bytes, byte for byte', async () => {
  const body = await encryptPayload(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: RFC.salt, senderJwk: jwkFrom(RFC.asPrivate, RFC.asPublic) });
  // 86-octet header + 42 octets of text and delimiter + 16 of tag (the RFC's "Content-Length: 145" is one too many).
  assert.equal(body.length, 144);
  assert.equal(b64u(body), RFC.body);
});

/** What the browser does (RFC 8291 in reverse), to prove a fresh-key message opens. */
async function decrypt(body, uaPair, uaPublicRaw, auth) {
  const te = new TextEncoder();
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPair.privateKey, 256));
  const h = async (s, ikm, info, n) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, k, n * 8));
  };
  const info = new Uint8Array([...te.encode('WebPush: info\0'), ...uaPublicRaw, ...asPublic]);
  const ikm = await h(auth, ecdh, info, 32);
  const cek = await h(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await h(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)));
  assert.equal(plain[plain.length - 1], 2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function browser() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, raw, auth, sub: { p256dh: b64u(raw), auth: b64u(auth) } };
}

test('a real message with fresh keys opens in the browser; every message has its own salt and key', async () => {
  const b = await browser();
  const msg = JSON.stringify({ title: 'MettleUp: news from your members', body: 'New shop order 7 from Neha. Get it ready on Shop.', route: '/shop', tag: 'mettleup-alert-x' });
  const one = await encryptPayload(msg, b.sub);
  const two = await encryptPayload(msg, b.sub);
  assert.equal(await decrypt(one, b.pair, b.raw, b.auth), msg);
  assert.notEqual(b64u(one.slice(0, 16)), b64u(two.slice(0, 16)));
  await assert.rejects(encryptPayload(msg, { p256dh: 'short', auth: b.sub.auth }), /BAD_SUBSCRIPTION/);
});

async function vapidKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { jwk: readVapidKey(JSON.stringify(jwk)), pair };
}

test('VAPID: a signed JWT for the push company, verifiable with the public key the browser subscribed with', async () => {
  const { jwk } = await vapidKey();
  assert.ok(jwk);
  const now = Date.parse('2026-11-14T06:00:00Z');
  const h = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', jwk, 'mailto:alerts@mettleup.fit', now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], webPushPublicKey(jwk));
  assert.equal(fromB64u(m[4]).length, 65);
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(m[2])));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:alerts@mettleup.fit' });
  const pub = await crypto.subtle.importKey('raw', fromB64u(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert.equal(ok, true);
});

test('the VAPID secret must be a P-256 private key', () => {
  assert.equal(readVapidKey('not json'), null);
  assert.equal(readVapidKey('{"kty":"RSA"}'), null);
  assert.equal(readVapidKey(JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'AA', y: 'AA', d: 'AA' })), null);
});

test('sendWebPush: the right headers; a gone address says so; never another host', async () => {
  const { jwk } = await vapidKey();
  const b = await browser();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return new Response('', { status: url.endsWith('/gone') ? 410 : 201 });
  };
  const msg = { title: 't', body: 'b', route: '/', tag: 'x' };
  const ok = await sendWebPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...b.sub }, msg, { jwk, subject: 'mailto:a@b.c', fetchImpl });
  assert.deepEqual(ok, { ok: true, status: 201, gone: false });
  assert.equal(seen[0].init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen[0].init.headers.TTL, '21600');
  assert.match(seen[0].init.headers.Authorization, /^vapid t=/);
  assert.equal(JSON.parse(await decrypt(seen[0].init.body, b.pair, b.raw, b.auth)).body, 'b');
  const gone = await sendWebPush({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gone', ...b.sub }, msg, { jwk, subject: 'mailto:a@b.c', fetchImpl });
  assert.equal(gone.gone, true);
  const evil = await sendWebPush({ endpoint: 'https://evil.example.com/push', ...b.sub }, msg, { jwk, subject: 'mailto:a@b.c', fetchImpl });
  assert.deepEqual(evil, { ok: false, status: 0, gone: true });
  assert.equal(seen.length, 2);
});
