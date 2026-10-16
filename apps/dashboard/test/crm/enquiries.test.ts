import { describe, expect, it } from 'vitest';
import {
  bucketCounts,
  dueCount,
  emptyEnquiryForm,
  enquiryBucket,
  filterCounts,
  filterEnquiries,
  findOpenDuplicate,
  followUpMessage,
  followUpPicks,
  validateEnquiry,
} from '../../src/crm/logic/enquiries';
import type { Enquiry } from '../../src/crm/types';

const TODAY = '2026-10-15';

let seq = 0;
function enq(over: Partial<Enquiry> = {}): Enquiry {
  seq += 1;
  return {
    id: `e${seq}`,
    gymId: 'g1',
    name: 'Rohit Meena',
    phone: '+919876543210',
    interest: null,
    followUpOn: null,
    status: 'open',
    memberId: null,
    createdAt: seq,
    updatedAt: seq,
    ...over,
  };
}

describe('enquiryBucket', () => {
  it('sorts open enquiries by their follow-up day', () => {
    expect(enquiryBucket(enq({ followUpOn: '2026-10-14' }), TODAY)).toBe('overdue');
    expect(enquiryBucket(enq({ followUpOn: TODAY }), TODAY)).toBe('today');
    expect(enquiryBucket(enq({ followUpOn: '2026-10-16' }), TODAY)).toBe('later');
    expect(enquiryBucket(enq({ followUpOn: null }), TODAY)).toBe('later');
  });

  it('closed enquiries go by how they closed, whatever the date', () => {
    expect(enquiryBucket(enq({ status: 'joined', followUpOn: '2026-10-01' }), TODAY)).toBe('joined');
    expect(enquiryBucket(enq({ status: 'lost', followUpOn: TODAY }), TODAY)).toBe('lost');
  });
});

describe('counts', () => {
  const list = [
    enq({ followUpOn: '2026-10-10' }),
    enq({ followUpOn: '2026-10-14' }),
    enq({ followUpOn: TODAY }),
    enq({ followUpOn: '2026-10-20' }),
    enq({ followUpOn: null }),
    enq({ status: 'joined' }),
    enq({ status: 'lost' }),
  ];

  it('counts each bucket', () => {
    expect(bucketCounts(list, TODAY)).toEqual({ overdue: 2, today: 1, later: 2, joined: 1, lost: 1 });
  });

  it('the home tile and the default chip both count overdue + today', () => {
    expect(dueCount(list, TODAY)).toBe(3);
    expect(filterCounts(list, TODAY)).toEqual({ due: 3, later: 2, joined: 1, lost: 1, all: 7 });
  });

  it('an empty gym counts zero', () => {
    expect(dueCount([], TODAY)).toBe(0);
  });
});

describe('filterEnquiries', () => {
  it('"Follow up today": longest overdue first, then today', () => {
    const a = enq({ name: 'Today', followUpOn: TODAY });
    const b = enq({ name: 'Yesterday', followUpOn: '2026-10-14' });
    const c = enq({ name: 'Last week', followUpOn: '2026-10-08' });
    const d = enq({ name: 'Later', followUpOn: '2026-10-18' });
    expect(filterEnquiries([a, b, c, d], 'due', TODAY).map((e) => e.name)).toEqual(['Last week', 'Yesterday', 'Today']);
  });

  it('"Later": soonest first, no date last', () => {
    const a = enq({ name: 'No date', followUpOn: null });
    const b = enq({ name: 'Next week', followUpOn: '2026-10-22' });
    const c = enq({ name: 'Tomorrow', followUpOn: '2026-10-16' });
    expect(filterEnquiries([a, b, c], 'later', TODAY).map((e) => e.name)).toEqual(['Tomorrow', 'Next week', 'No date']);
  });

  it('closed lists show the most recently closed first', () => {
    const a = enq({ name: 'Old', status: 'lost', updatedAt: 100 });
    const b = enq({ name: 'New', status: 'lost', updatedAt: 200 });
    expect(filterEnquiries([a, b], 'lost', TODAY).map((e) => e.name)).toEqual(['New', 'Old']);
  });

  it('"All" shows everyone, due first and closed last', () => {
    const joined = enq({ name: 'Joined', status: 'joined' });
    const later = enq({ name: 'Later', followUpOn: '2026-10-20' });
    const overdue = enq({ name: 'Overdue', followUpOn: '2026-10-01' });
    const lost = enq({ name: 'Lost', status: 'lost' });
    expect(filterEnquiries([joined, later, overdue, lost], 'all', TODAY).map((e) => e.name)).toEqual([
      'Overdue',
      'Later',
      'Joined',
      'Lost',
    ]);
  });

  it('does not reorder the list it was given', () => {
    const list = [enq({ followUpOn: TODAY }), enq({ followUpOn: '2026-10-01' })];
    const ids = list.map((e) => e.id);
    filterEnquiries(list, 'due', TODAY);
    expect(list.map((e) => e.id)).toEqual(ids);
  });
});

describe('follow-up picks', () => {
  it('tomorrow, 3 days, a week — across a month end', () => {
    expect(followUpPicks('2026-10-30').map((p) => p.date)).toEqual(['2026-10-31', '2026-11-02', '2026-11-06']);
  });
});

describe('validateEnquiry', () => {
  const base = () => ({ ...emptyEnquiryForm(TODAY), name: ' Rohit   Meena ', phone: '98765 43210' });

  it('the blank form starts on +91 with a call tomorrow', () => {
    expect(emptyEnquiryForm(TODAY)).toMatchObject({ dialCode: '+91', followUpOn: '2026-10-16' });
  });

  it('cleans a good form into a draft', () => {
    const r = validateEnquiry({ ...base(), interest: '  3 months,   evening batch ' }, TODAY);
    expect(r).toEqual({
      ok: true,
      value: { name: 'Rohit Meena', phone: '+919876543210', interest: '3 months, evening batch', followUpOn: '2026-10-16' },
    });
  });

  it('empty interest and no date are fine', () => {
    const r = validateEnquiry({ ...base(), interest: '  ', followUpOn: '' }, TODAY);
    expect(r).toMatchObject({ ok: true, value: { interest: null, followUpOn: null } });
  });

  it('names the field at fault', () => {
    expect(validateEnquiry({ ...base(), name: 'R' }, TODAY)).toMatchObject({ ok: false, field: 'name' });
    expect(validateEnquiry({ ...base(), phone: '12345' }, TODAY)).toMatchObject({ ok: false, field: 'phone' });
    expect(validateEnquiry({ ...base(), followUpOn: '2026-02-30' }, TODAY)).toMatchObject({ ok: false, field: 'followUpOn' });
    expect(validateEnquiry({ ...base(), followUpOn: '2026-10-14' }, TODAY)).toMatchObject({ ok: false, field: 'followUpOn' });
    expect(validateEnquiry({ ...base(), followUpOn: TODAY }, TODAY).ok).toBe(true);
  });

  it('a non-Indian number keeps its own code', () => {
    const r = validateEnquiry({ ...base(), dialCode: '+971', phone: '50 123 4567' }, TODAY);
    expect(r).toMatchObject({ ok: true, value: { phone: '+971501234567' } });
  });
});

describe('findOpenDuplicate', () => {
  it('finds an open enquiry on the same number only', () => {
    const open = enq({ phone: '+919876543210' });
    const lost = enq({ phone: '+919999999999', status: 'lost' });
    expect(findOpenDuplicate([open, lost], '+919876543210')).toBe(open);
    expect(findOpenDuplicate([open, lost], '+919999999999')).toBeNull();
    expect(findOpenDuplicate([open], '+919876543210', open.id)).toBeNull();
  });
});

describe('followUpMessage', () => {
  const gym = { name: 'Iron Temple' };

  it('English: first name, the gym, what they asked about, signed', () => {
    const t = followUpMessage({ name: 'Rohit Meena', interest: '3 months, evening batch' }, gym);
    expect(t).toMatch(/^Hi Rohit, you asked about Iron Temple \(3 months, evening batch\)\./);
    expect(t).toMatch(/\n– Iron Temple$/);
  });


  it('a gym with no name yet still signs off', () => {
    expect(followUpMessage({ name: 'Rohit', interest: null }, { name: ' ' })).toMatch(/– Your gym$/);
  });
});
