// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). The block-proof address, R-55.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STAMP, SUPABASE, forwardHeaders, handleProxy, isProxyPath, targetUrl } from './proxy.js';

test('only /sb and /sb/... are ours', () => {
  assert.equal(isProxyPath('/sb'), true);
  assert.equal(isProxyPath('/sb/rest/v1/rpc/member_me'), true);
  assert.equal(isProxyPath('/sbx'), false);
  assert.equal(isProxyPath('/home/'), false);
  assert.equal(isProxyPath('/'), false);
});

test('the path after /sb and the query go to Supabase unchanged', () => {
  const u = new URL('https://forgeai.aakashpahuja.in/sb/rest/v1/member_products?select=*&gym=eq.x');
  assert.equal(targetUrl(u), `${SUPABASE}/rest/v1/member_products?select=*&gym=eq.x`);
  assert.equal(targetUrl(new URL('https://forgeai.aakashpahuja.in/sb')), `${SUPABASE}/`);
  assert.equal(
    targetUrl(new URL('https://forgeai.aakashpahuja.in/sb/storage/v1/object/public/gym-logos/ab/logo.png')),
    `${SUPABASE}/storage/v1/object/public/gym-logos/ab/logo.png`,
  );
});

test('apikey and Authorization go on; our cookies and Cloudflare headers do not', () => {
  const h = forwardHeaders(
    new Headers({ apikey: 'k', Authorization: 'Bearer t', Cookie: 'x=1', 'CF-Connecting-IP': '1.2.3.4', Host: 'forgeai.aakashpahuja.in', 'Content-Type': 'application/json' }),
  );
  assert.equal(h.get('apikey'), 'k');
  assert.equal(h.get('authorization'), 'Bearer t');
  assert.equal(h.get('content-type'), 'application/json');
  assert.equal(h.get('cookie'), null);
  assert.equal(h.get('cf-connecting-ip'), null);
  assert.equal(h.get('host'), null);
});

test('a POST is passed on with its body, method and status; the answer comes back as it is', async () => {
  let seen;
  const fake = async (target, init) => {
    seen = { target, method: init.method, body: await new Response(init.body).text(), apikey: init.headers.get('apikey') };
    return new Response('{"ok":1}', { status: 201, headers: { 'Content-Type': 'application/json', 'X-Test': 'y' } });
  };
  const req = new Request('https://forgeai.aakashpahuja.in/sb/rest/v1/rpc/member_check_in', {
    method: 'POST',
    headers: { apikey: 'k', 'Content-Type': 'application/json' },
    body: '{"p_code":"FORGE1"}',
  });
  const res = await handleProxy(req, new URL(req.url), fake);
  assert.deepEqual(seen, { target: `${SUPABASE}/rest/v1/rpc/member_check_in`, method: 'POST', body: '{"p_code":"FORGE1"}', apikey: 'k' });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('x-test'), 'y');
  assert.equal(res.headers.get(STAMP), '1'); // a real answer from Supabase
  assert.equal(await res.text(), '{"ok":1}');
});

test('Supabase not answering: a plain 502, never a hang or a crash', async () => {
  const req = new Request('https://forgeai.aakashpahuja.in/sb/rest/v1/', { headers: { apikey: 'k' } });
  const res = await handleProxy(req, new URL(req.url), async () => {
    throw new Error('down');
  });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get(STAMP), 'unreachable');
  assert.match(await res.text(), /could not be reached/);
});

// R-153 step 2: a message sent or an offer started tells HQ to send the phone pop-ups now.
test('pushAfter tells HQ only after a successful send or offer, and never changes the answer', async () => {
  const { pushAfter, wantsPush } = await import('./proxy.js');
  const at = (path, method = 'POST') => [new Request(`https://app.mettleup.fit${path}`, { method, body: method === 'POST' ? '{}' : undefined }), new URL(`https://app.mettleup.fit${path}`)];
  assert.equal(wantsPush(...at('/sb/rest/v1/rpc/owner_send_message'), 200), true);
  assert.equal(wantsPush(...at('/sb/rest/v1/rpc/owner_save_offer'), 200), true);
  assert.equal(wantsPush(...at('/sb/rest/v1/rpc/owner_send_message'), 400), false);
  assert.equal(wantsPush(...at('/sb/rest/v1/rpc/member_messages'), 200), false);
  assert.equal(wantsPush(...at('/sb/rest/v1/rpc/owner_send_message', 'GET'), 200), false);

  const kicks = [];
  const waits = [];
  const env = { HQ_PUSH: { fetch: async (u, init) => { kicks.push([u, init.method]); return new Response(null, { status: 202 }); } } };
  const ctx = { waitUntil: (p) => waits.push(p) };
  const answer = new Response('{"id":"x"}', { status: 200 });
  assert.equal(pushAfter(...at('/sb/rest/v1/rpc/owner_send_message'), env, ctx, answer), answer);
  pushAfter(...at('/sb/rest/v1/rpc/member_me'), env, ctx, new Response('{}', { status: 200 }));
  // No binding (an older deploy): nothing happens, the answer is the same.
  assert.equal(pushAfter(...at('/sb/rest/v1/rpc/owner_send_message'), {}, ctx, answer), answer);
  // HQ unreachable: quiet.
  const broken = { HQ_PUSH: { fetch: async () => { throw new Error('down'); } } };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    pushAfter(...at('/sb/rest/v1/rpc/owner_save_offer'), broken, ctx, answer);
    await Promise.all(waits);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(kicks, [['https://hq.mettleup.fit/push/run', 'POST']]);
});
