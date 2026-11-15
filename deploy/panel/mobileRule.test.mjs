// R-580 (owner, 15 Nov 2026): every Worker that takes a typed mobile number applies the SAME 10-digit rule as the
// boxes (packages/theme/src/indianMobile.ts), on the same shared table. Never trust the page: a page without the rule
// (an old copy in a browser's cache, a bot) still lands on the same 10 digits here.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MOBILE_CASES } from '../../packages/theme/src/indianMobile.ts';
import { checkFriend } from './friend.js';
import { mobileOf } from './gymPageServe.js';
import { checkLead } from './leads.js';
import { indianMobile, senderMobile } from './phoneCode.js';

const valid = (ten) => /^[6-9]\d{9}$/.test(ten);

test('R-580: the friend invite, the demo request, the gym page and the sign-in code all keep the same 10 digits', () => {
  for (const [typed, ten] of MOBILE_CASES) {
    const f = checkFriend({ code: 'ABCD2345', name: 'Riya Sharma', phone: typed, time: 'any' });
    const l = checkLead({ phone: typed, gym: 'Shakti Gym' });
    if (valid(ten)) {
      assert.equal(f.value?.phone, ten, `friend ${typed}`);
      assert.equal(l.value?.phone, ten, `lead ${typed}`);
    } else {
      assert.equal(f.error, 'BAD_PHONE', `friend ${typed}`);
      assert.ok(l.error, `lead ${typed}`);
    }
    assert.equal(mobileOf(typed), valid(ten) ? ten : null, `gym page ${typed}`);
    assert.equal(indianMobile(typed), valid(ten) ? ten : null, `sign-in ${typed}`);
  }
});

test('R-580: the keyboard suggestion "+91 98765 43210" is one number everywhere', () => {
  assert.equal(checkFriend({ code: 'ABCD2345', name: 'Riya Sharma', phone: '+91 98765 43210' }).value.phone, '9876543210');
  assert.equal(checkLead({ phone: '+91 98765 43210' }).value.phone, '9876543210');
  assert.equal(mobileOf('(+91) 98765-43210'), '9876543210');
  assert.equal(indianMobile('0091 98765 43210'), '9876543210');
});

test('R-580: the WhatsApp sender is never cut to its last 10 digits', () => {
  assert.equal(senderMobile('919876543210'), '9876543210');
  assert.equal(senderMobile('449876543210'), null);
});
