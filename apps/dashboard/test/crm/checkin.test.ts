/**
 * QR self check-in (15 Oct 2026): the poster's link and words, the register's "App" tag, and that
 * a visit the SERVER wrote for a member's phone (member_check_in, 0015: id '<memberId>:<day>',
 * source 'app', the gym's version moved by one) behaves like a desk check-in in the panel — seen
 * on the next pull, never doubled by the desk, and undone like any other.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { CloudCrmData, type CrmCloudApi, type CrmRecord, type PullResult } from '../../src/crm/data/cloud';
import { setCurrentLang } from '../../src/crm/i18n';
import { visitSourceTag } from '../../src/crm/logic/attendance';
import { CHECKIN_POSTER, checkInLink } from '../../src/crm/shop/checkin';
import { inviteLink } from '../../src/crm/shop/invite';
import { POSTER, qrModules } from '../../src/crm/shop/InviteScreen';
import type { MemberDraft } from '../../src/crm/types';

afterEach(() => setCurrentLang('en'));

describe('check-in link', () => {
  it('is the gym code under /c/ on the panel site, in capitals', () => {
    expect(checkInLink('rams01')).toBe('https://forgeai.aakashpahuja.in/c/RAMS01');
    expect(checkInLink(' FORGE1 ')).toBe('https://forgeai.aakashpahuja.in/c/FORGE1');
  });

  it('is not the invite link (a different screen opens)', () => {
    expect(checkInLink('RAMS01')).not.toBe(inviteLink('RAMS01'));
    expect(checkInLink('RAMS01').replace('/c/', '/j/')).toBe(inviteLink('RAMS01'));
  });

  it('fits in a QR the poster can print', () => {
    const q = qrModules(checkInLink('RAMS01'));
    expect(q.size).toBeGreaterThanOrEqual(21);
    expect(q.path.length).toBeGreaterThan(100);
  });
});

describe('the check-in poster', () => {
  it('says scan to check in, in English and Hinglish', () => {
    expect(CHECKIN_POSTER.lead).toBe('Scan to check in');
    expect(CHECKIN_POSTER.leadHi).toBe('Check in ke liye scan karein');
    expect(CHECKIN_POSTER.steps).toHaveLength(3);
    expect(CHECKIN_POSTER.stepsHi.split(' · ')).toHaveLength(3);
  });

  it('sends members without the app to the desk, and saves under its own name', () => {
    expect(CHECKIN_POSTER.codeLine('RAMS01')).toMatch(/desk/);
    expect(CHECKIN_POSTER.codeLineHi('RAMS01')).toMatch(/desk/i);
    expect(CHECKIN_POSTER.file).toBe('checkin-poster');
    expect(POSTER.file).toBe('invite-poster');
  });
});

describe('the register tag', () => {
  it('marks app and imported check-ins, never the desk’s own', () => {
    expect(visitSourceTag('app')).toBe('App');
    expect(visitSourceTag('import')).toBe('Imported');
    expect(visitSourceTag('desk')).toBeNull();
  });

  it('follows the panel’s language', () => {
    setCurrentLang('hi');
    expect(visitSourceTag('app')).toBe('App');
    expect(visitSourceTag('import')).toBe('Import kiya');
  });
});

// ---------------------------------------------------------------- the server's visit in the panel

/** crm_pull / crm_push with the server's rules, plus what member_check_in does. */
class Server implements CrmCloudApi {
  version = 0;
  rows = new Map<string, { r: CrmRecord; v: number }>();
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };

  async pull(_key: string, since: number): Promise<PullResult> {
    const records = [...this.rows.values()].filter((x) => x.v > since && (since > 0 || !x.r.x)).sort((a, b) => a.v - b.v).map((x) => x.r);
    return { version: this.version, gym: { ...this.gym }, records: JSON.parse(JSON.stringify(records)) };
  }

  async push(_key: string, base: number, records: CrmRecord[]): Promise<number> {
    if (base !== this.version) throw new Error('STALE');
    this.version += 1;
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, { r: JSON.parse(JSON.stringify(r)), v: this.version });
    return this.version;
  }

  /** member_check_in (0015): one visit row under the gym's lock, the version moved by one. */
  appCheckIn(memberId: string, day: string, at: number): void {
    const id = `${memberId}:${day}`;
    this.version += 1;
    this.rows.set(`visit:${id}`, {
      r: { k: 'visit', id, d: { id, gymId: this.gym.gymId, memberId, visitedOn: day, checkedInAt: at, source: 'app' } },
      v: this.version,
    });
  }
}

const TODAY = '2026-10-15';
const draft: MemberDraft = {
  fullName: 'Asha Verma',
  phone: '+919829012345',
  email: null,
  gender: 'female',
  dateOfBirth: null,
  address: null,
  emergencyName: null,
  emergencyPhone: null,
  joinedOn: TODAY,
  photoUri: null,
  notes: null,
  archived: false,
};

describe('an app check-in in the panel', () => {
  it('shows on the next pull as an App visit', async () => {
    const server = new Server();
    const desk = new CloudCrmData('k', server);
    const m = await desk.createMember(draft);
    server.appCheckIn(m.id, TODAY, Date.UTC(2026, 9, 15, 13, 12));
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.visits).toEqual([expect.objectContaining({ id: `${m.id}:${TODAY}`, memberId: m.id, visitedOn: TODAY, source: 'app' })]);
  });

  it('is not doubled when the desk checks the same member in later that day, even from an old copy', async () => {
    const server = new Server();
    const desk = new CloudCrmData('k', server);
    const m = await desk.createMember(draft);
    // The member scans after the desk's copy was loaded: the desk's next push is STALE, pulls, redoes.
    server.appCheckIn(m.id, TODAY, Date.UTC(2026, 9, 15, 13, 12));
    await desk.checkIn(m.id, TODAY, 'desk', TODAY);
    const visits = [...server.rows.values()].filter((x) => x.r.k === 'visit' && !x.r.x);
    expect(visits).toHaveLength(1);
    expect((visits[0].r.d as { source: string }).source).toBe('app');
  });

  it('is undone by the register’s Undo like any other check-in', async () => {
    const server = new Server();
    const desk = new CloudCrmData('k', server);
    const m = await desk.createMember(draft);
    server.appCheckIn(m.id, TODAY, Date.UTC(2026, 9, 15, 13, 12));
    // The panel's 15-second poll brings it in; the register then shows it with Undo.
    await desk.refresh();
    expect((await desk.load()).visits.map((v) => v.source)).toEqual(['app']);
    await desk.undoCheckIn(m.id, TODAY);
    expect(server.rows.get(`visit:${m.id}:${TODAY}`)?.r.x).toBe(true);
    expect((await new CloudCrmData('k', server).load()).visits).toEqual([]);
  });
});
