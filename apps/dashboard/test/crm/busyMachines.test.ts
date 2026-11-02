/**
 * F137: "Busy machines" in the admin app. Reading the server, the editor's draft and what it saves, the words,
 * and the card staying hidden until the server has 0049.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import { READY_MACHINES } from '@forgeai/theme';
import {
  MACHINES_HOW,
  MACHINES_MEMBER_SEES,
  countedInDraft,
  draftFrom,
  machineErrorWords,
  machineSetupFrom,
  machineStatusWords,
  machinesChanged,
  machinesPayload,
  newOwnId,
  unitsOf,
  type MachineDraft,
  type SavedMachine,
} from '../../src/crm/logic/busyMachines';
import { getMachineSetup, machineServer, resetMachinesForTest, saveMachineSetup } from '../../src/crm/shop/machinesApi';

const legPress = READY_MACHINES.find((m) => m.id === 'leg_press')!;
const treadmill = READY_MACHINES.find((m) => m.id === 'treadmill')!;

const saved = machineSetupFrom({
  enabled: true,
  canEdit: true,
  membersSending: 12,
  updatedAt: 1,
  updatedByName: null,
  machines: [
    { id: 'leg_press', name: 'Leg press', units: 1, ex: [...legPress.ex], own: false, counted: true, check: { weeksChecked: 5, weeksRight: 4, proven: true } },
    { id: 'treadmill', name: 'Treadmill', units: 10, ex: [...treadmill.ex], own: false, counted: false, check: null },
    { id: 'own_1', name: 'Belt squat combo', units: 1, ex: ['belt_squat'], own: true, counted: true, check: { weeksChecked: 0, weeksRight: 0, proven: false } },
  ],
});

const empty: MachineDraft = { enabled: false, counts: {}, own: [] };

describe('reading the server', () => {
  it('keeps the machines and their weekly check', () => {
    expect(saved.machines.map((m) => [m.id, m.counted, m.check?.proven ?? null])).toEqual([
      ['leg_press', true, true],
      ['treadmill', false, null],
      ['own_1', true, false],
    ]);
    expect(saved.membersSending).toBe(12);
  });

  it('nothing saved yet: off and empty', () => {
    expect(machineSetupFrom({ enabled: false, machines: [], canEdit: false })).toMatchObject({ enabled: false, machines: [], canEdit: false, membersSending: null });
    expect(machineSetupFrom(null).machines).toEqual([]);
  });
});

describe('the draft and what is saved', () => {
  it('a saved list comes back to the same draft and is not "changed"', () => {
    const d = draftFrom(saved);
    expect(d.counts).toEqual({ leg_press: '1', treadmill: '10' });
    expect(d.own).toEqual([{ id: 'own_1', name: 'Belt squat combo', units: '1', ex: ['belt_squat'] }]);
    expect(machinesChanged(d, saved)).toBe(false);
    expect(machinesChanged({ ...d, enabled: false }, saved)).toBe(true);
    expect(machinesChanged({ ...d, counts: { ...d.counts, leg_press: '2' } }, saved)).toBe(true);
  });

  it('empty or 0 = none; a ready machine carries its exercises; added ones are tidied', () => {
    const { payload } = machinesPayload({
      enabled: true,
      counts: { leg_press: '2', squat_rack: '', smith_machine: '0' },
      own: [{ id: 'own_1', name: '  Belt   squat ', units: '1', ex: ['belt_squat', 'belt_squat'] }],
    });
    expect(payload).toEqual([
      { id: 'leg_press', name: 'Leg press', units: 2, ex: [...legPress.ex], own: false },
      { id: 'own_1', name: 'Belt squat', units: 1, ex: ['belt_squat'], own: true },
    ]);
  });

  it('refuses a bad count, an added machine with no name, count or a repeated name', () => {
    expect(machinesPayload({ ...empty, counts: { leg_press: '1.5' } }).problem).toMatch(/^Leg press: type how many/);
    expect(machinesPayload({ ...empty, counts: { leg_press: '51' } }).problem).toMatch(/from 1 to 50/);
    expect(machinesPayload({ ...empty, own: [{ id: 'own_1', name: ' ', units: '1', ex: [] }] }).problem).toBe('Give the machine you added a name.');
    expect(machinesPayload({ ...empty, own: [{ id: 'own_1', name: 'Belt', units: '', ex: [] }] }).problem).toMatch(/^Belt: type how many/);
    expect(machinesPayload({ ...empty, counts: { leg_press: '1' }, own: [{ id: 'own_1', name: 'leg press', units: '1', ex: [] }] }).problem).toMatch(/twice/);
  });

  it('counts, ids and how many can get busy', () => {
    expect(unitsOf('')).toBeNull();
    expect(unitsOf('0')).toBeNull();
    expect(unitsOf(' 2 ')).toBe(2);
    expect(unitsOf('-1')).toBe('bad');
    expect(newOwnId([{ id: 'own_1' }, { id: 'own_3' }])).toBe('own_2');
    expect(countedInDraft({ enabled: true, counts: { leg_press: '1', squat_rack: '2', treadmill: '8' }, own: [{ id: 'own_1', name: 'X', units: '1', ex: [] }] })).toBe(2);
  });
});

describe('the words', () => {
  const m = (over: Partial<SavedMachine>): SavedMachine => ({ id: 'a', name: 'A', units: 1, ex: ['leg_press'], own: false, counted: true, check: null, ...over });

  it('says what the app does with each machine', () => {
    expect(machineStatusWords(m({ ex: [] , counted: false }), true)).toBe('Not used yet. Pick the exercises done on it.');
    expect(machineStatusWords(m({ units: 6, counted: false }), true)).toBe('Not used. You have 6, so it rarely gets busy.');
    expect(machineStatusWords(m({}), false)).toBe('Busy machines are switched off.');
    expect(machineStatusWords(m({}), true)).toBe('It is still learning. Members see nothing yet.');
    expect(machineStatusWords(m({ check: { weeksChecked: 3, weeksRight: 2, proven: false } }), true)).toMatch(/^It is still learning. Its guess was right 2 of the last 3 weeks/);
    expect(machineStatusWords(m({ check: { weeksChecked: 6, weeksRight: 5, proven: true } }), true)).toBe('Members see tips. Its guess was right 5 of the last 6 weeks.');
  });

  it('plain refusals, and no banned words', () => {
    expect(machineErrorWords(new Error('OWNER_ONLY'))).toBe('Only the owner can change this.');
    expect(machineErrorWords({ message: 'INVALID' })).toMatch(/could not be saved/);
    expect(machineErrorWords(new Error('SUSPENDED'))).toMatch(/paused/);
    expect(machineErrorWords(new Error('timed out'))).toBeNull();
    expect(`${MACHINES_HOW} ${MACHINES_MEMBER_SEES}`).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('the card stays hidden until the server has 0049', () => {
  beforeEach(() => {
    callMock.mockReset();
    resetMachinesForTest();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PGRST202: "missing", remembered, one quiet note, no second call', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    callMock.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function public.owner_machine_setup' });
    expect(await getMachineSetup('k')).toBe('missing');
    expect(await getMachineSetup('k')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(machineServer()).toBe('no');
  });

  it('an answer: "yes"; no internet: thrown and not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('timed out'));
    await expect(getMachineSetup('k')).rejects.toThrow('timed out');
    expect(machineServer()).toBe('unknown');
    callMock.mockResolvedValueOnce({ enabled: false, machines: [], canEdit: true });
    expect(await getMachineSetup('k')).toMatchObject({ enabled: false, canEdit: true });
    expect(machineServer()).toBe('yes');
    expect(callMock).toHaveBeenLastCalledWith('owner_machine_setup', { p_key: 'k' });
  });

  it('saving sends the switch and the list', async () => {
    callMock.mockResolvedValueOnce({ enabled: true, machines: [], canEdit: true });
    await saveMachineSetup('k', true, [{ id: 'leg_press', name: 'Leg press', units: 1, ex: ['leg_press'], own: false }]);
    expect(callMock).toHaveBeenCalledWith('owner_save_machine_setup', {
      p_key: 'k',
      p_enabled: true,
      p_machines: [{ id: 'leg_press', name: 'Leg press', units: 1, ex: ['leg_press'], own: false }],
    });
  });
});
