import { describe, expect, it } from 'vitest';

import {
  ALL_BATCHES,
  batchKey,
  countWithoutBatch,
  inBatch,
  listBatches,
  memberBatch,
  NO_BATCH,
  normalizeBatch,
  resolveBatch,
} from '../../src/crm/logic/batches';
import { emptyMemberForm, memberToForm, validateMember } from '../../src/crm/logic/members';
import { LocalCrmData, memoryStore, normalizeSnapshot, SCHEMA_VERSION } from '../../src/crm/data/local';
import { buildSnapshot, diffSnapshots, emptyRows } from '../../src/crm/data/cloud';
import { makeMember } from './fixtures';

const TODAY = '2026-07-26';

describe('normalizeBatch', () => {
  it('trims and collapses inner spaces', () => {
    expect(normalizeBatch('  Morning   6-8 ')).toBe('Morning 6-8');
  });
  it('blank, undefined and non-strings are no batch', () => {
    expect(normalizeBatch('   ')).toBeNull();
    expect(normalizeBatch(undefined)).toBeNull();
    expect(normalizeBatch(null)).toBeNull();
    expect(normalizeBatch(7)).toBeNull();
  });
  it('batchKey ignores case', () => {
    expect(batchKey('MORNING  6-8')).toBe(batchKey('morning 6-8'));
  });
});

describe('memberBatch', () => {
  it('an old member with no batch field has none', () => {
    const old = makeMember();
    delete (old as { batch?: unknown }).batch;
    expect(memberBatch(old)).toBeNull();
  });
});

describe('listBatches', () => {
  const ms = [
    { batch: 'Evening 6-9' },
    { batch: 'morning 6-8' },
    { batch: 'Morning  6-8' },
    { batch: 'MORNING 6-8' },
    { batch: 'evening 6-9' },
    { batch: 'Ladies 11-12' },
    { batch: null },
    {},
  ];

  it('counts case-insensitively, keeps the first spelling, most used first', () => {
    expect(listBatches(ms)).toEqual([
      { name: 'morning 6-8', key: 'morning 6-8', countN: 3 },
      { name: 'Evening 6-9', key: 'evening 6-9', countN: 2 },
      { name: 'Ladies 11-12', key: 'ladies 11-12', countN: 1 },
    ]);
  });

  it('ties break by name', () => {
    expect(listBatches([{ batch: 'Zumba' }, { batch: 'Aerobics' }]).map((b) => b.name)).toEqual(['Aerobics', 'Zumba']);
  });

  it('counts members with no batch', () => {
    expect(countWithoutBatch(ms)).toBe(2);
  });

  it('is empty for a gym with no batches', () => {
    expect(listBatches([{}, { batch: '' }])).toEqual([]);
  });
});

describe('resolveBatch', () => {
  const existing = ['Morning 6-8', 'Evening 6-9'];
  it('a different spelling of a known batch becomes the gym’s spelling', () => {
    expect(resolveBatch('  morning   6-8', existing)).toBe('Morning 6-8');
  });
  it('a new name is kept, cleaned', () => {
    expect(resolveBatch(' Ladies  11-12 ', existing)).toBe('Ladies 11-12');
  });
  it('blank is no batch', () => {
    expect(resolveBatch('  ', existing)).toBeNull();
  });
});

describe('inBatch', () => {
  it('all, none and a batch key', () => {
    expect(inBatch({ batch: 'Morning 6-8' }, ALL_BATCHES)).toBe(true);
    expect(inBatch({}, ALL_BATCHES)).toBe(true);
    expect(inBatch({ batch: 'MORNING 6-8 ' }, 'morning 6-8')).toBe(true);
    expect(inBatch({ batch: 'Evening 6-9' }, 'morning 6-8')).toBe(false);
    expect(inBatch({}, NO_BATCH)).toBe(true);
    expect(inBatch({ batch: 'Evening 6-9' }, NO_BATCH)).toBe(false);
  });
});

describe('the member form carries the batch', () => {
  it('saves a cleaned batch, and blank as null', () => {
    const base = { ...emptyMemberForm(TODAY), fullName: 'Riya Sharma', phone: '9876543210' };
    const a = validateMember({ ...base, batch: '  Morning   6-8 ' }, TODAY);
    expect(a.ok && a.value.batch).toBe('Morning 6-8');
    const b = validateMember({ ...base, batch: '' }, TODAY);
    expect(b.ok && b.value.batch).toBeNull();
  });

  it('refuses a name longer than a chip', () => {
    const base = { ...emptyMemberForm(TODAY), fullName: 'Riya Sharma', phone: '9876543210' };
    const r = validateMember({ ...base, batch: 'x'.repeat(41) }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('batch');
  });

  it('an old member opens with no batch', () => {
    const old = makeMember();
    delete (old as { batch?: unknown }).batch;
    expect(memberToForm(old).batch).toBe('');
  });
});

describe('stores: old members without a batch', () => {
  it('normalizeSnapshot reads a missing batch as null and cleans a stored one', async () => {
    const old = makeMember({ id: 'm1' });
    delete (old as { batch?: unknown }).batch;
    const messy = makeMember({ id: 'm2', phone: '+919876500002', batch: '  Morning  6-8 ' });
    const snap = normalizeSnapshot({
      gym: { gymId: 'g', name: 'G', joinCode: 'X', phone: null, address: null, gstin: null, createdAt: 0 },
      members: [old, messy],
    } as never);
    expect(snap.members.map((m) => m.batch)).toEqual([null, 'Morning 6-8']);
  });

  it('an edit saves the batch through the browser store', async () => {
    const d = new LocalCrmData({ store: memoryStore(), now: () => 1 });
    const m = await d.createMember({
      ...(({ id: _i, gymId: _g, createdAt: _c, updatedAt: _u, appUserId: _a, ...rest }) => rest)(makeMember()),
      batch: ' Evening   6-9 ',
    });
    expect(m.batch).toBe('Evening 6-9');
    const edited = await d.updateMember(m.id, { batch: null });
    expect(edited.batch).toBeNull();
  });

  it('the cloud copy does not re-send untouched old members', async () => {
    const old = makeMember({ id: 'm1' });
    delete (old as { batch?: unknown }).batch;
    const rows = emptyRows();
    rows.member.set('m1', old);
    const gymRow = { gymId: 'g', name: 'G', joinCode: 'X', createdAt: 0 } as never;
    const before = buildSnapshot(rows, gymRow);
    const copy = new LocalCrmData({ store: memoryStore(JSON.stringify({ version: SCHEMA_VERSION, snapshot: before })) });
    const after = await copy.load();
    expect(diffSnapshots(before, after)).toEqual([]);
  });
});
