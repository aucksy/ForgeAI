/**
 * QR self check-in (15 Oct 2026): the gym's poster link opens "Check in at <gym>". The pure half
 * (which URLs are a check-in poster's, member_check_in's answer, the mobile number, every word the
 * screen shows), the action's handling of a lost key, and that the link is wired into Android in
 * BOTH app.json and the committed AndroidManifest.xml.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
const sent: { key: string; code: string; phone: string | null }[] = [];
let answer: unknown = null;
vi.mock('@/shop/gymApi', () => ({
  apiCheckIn: async (key: string, code: string, phone: string | null) => {
    sent.push({ key, code, phone });
    return answer;
  },
}));
vi.mock('@/theme/logoPrefetch', () => ({ prefetchGymLogo: () => undefined }));

import {
  checkInCodeFromUrl,
  checkInErrorText,
  checkInFromRow,
  checkInStanding,
  checkInTime,
  checkInTitle,
  checkInUrl,
  doneDetail,
  doneHeadline,
  formatMobile,
  isRealFailure,
  mobileDigits,
  notMemberText,
  problemText,
} from '@/shop/checkIn';
import { checkInAtGym } from '@/shop/gymActions';
import { useGymShop } from '@/shop/gymStore';
import { setPendingCheckIn, takePendingCheckIn } from '@/shop/pendingInvite';

describe('check-in URLs', () => {
  it('reads the code from the poster link and the app link', () => {
    expect(checkInCodeFromUrl('https://forgeai.aakashpahuja.in/c/RAMS01')).toBe('RAMS01');
    expect(checkInCodeFromUrl('https://forgeai.aakashpahuja.in/c/rams01?src=qr')).toBe('RAMS01');
    expect(checkInCodeFromUrl('https://FORGEAI.aakashpahuja.in/c/FORGE1/')).toBe('FORGE1');
    expect(checkInCodeFromUrl('forgeai://c/FORGE1')).toBe('FORGE1');
  });

  it('ignores links that are not a check-in poster', () => {
    expect(checkInCodeFromUrl('https://forgeai.aakashpahuja.in/j/RAMS01')).toBeNull();
    expect(checkInCodeFromUrl('https://evil.example.com/c/RAMS01')).toBeNull();
    expect(checkInCodeFromUrl('https://forgeai.aakashpahuja.in/c/RAMS')).toBeNull();
    expect(checkInCodeFromUrl('https://forgeai.aakashpahuja.in/c/%E0%A4')).toBeNull();
    expect(checkInCodeFromUrl(null)).toBeNull();
    expect(checkInCodeFromUrl('')).toBeNull();
  });

  it('builds the same link the panel prints', () => {
    expect(checkInUrl('rams01')).toBe('https://forgeai.aakashpahuja.in/c/RAMS01');
    expect(checkInCodeFromUrl(checkInUrl('FORGE1'))).toBe('FORGE1');
  });

  it('keeps a poster scanned before setup, once', () => {
    setPendingCheckIn('RAMS01');
    expect(takePendingCheckIn()).toBe('RAMS01');
    expect(takePendingCheckIn()).toBeNull();
  });
});

describe('where the phone stands', () => {
  it('is fresh, same or other', () => {
    expect(checkInStanding(null, 'RAMS01')).toBe('fresh');
    expect(checkInStanding({ joinCode: 'rams01' }, 'RAMS01')).toBe('same');
    expect(checkInStanding({ joinCode: 'FORGE1' }, 'RAMS01')).toBe('other');
    // A saved link without a code is never taken for the poster's gym.
    expect(checkInStanding({ joinCode: '' }, 'RAMS01')).toBe('other');
  });
});

describe('the mobile number', () => {
  it('reads every way a number is typed', () => {
    expect(mobileDigits('9829012345')).toBe('9829012345');
    expect(mobileDigits('+91 98290-12345')).toBe('9829012345');
    expect(mobileDigits('+919829012345')).toBe('9829012345');
    expect(mobileDigits('098290 12345')).toBe('9829012345');
    expect(mobileDigits('919829012345')).toBe('9829012345');
  });

  it('refuses what is not an Indian mobile', () => {
    expect(mobileDigits('12345')).toBeNull();
    expect(mobileDigits('5829012345')).toBeNull();
    expect(mobileDigits('')).toBeNull();
    expect(mobileDigits(null)).toBeNull();
  });

  it('shows it the Indian way', () => {
    expect(formatMobile('+919829012345')).toBe('+91 98290 12345');
    expect(formatMobile('9829012345')).toBe('+91 98290 12345');
    expect(formatMobile('12')).toBe('12');
  });
});

describe("member_check_in's answer", () => {
  it('reads a check-in', () => {
    const a = checkInFromRow({ ok: true, alreadyIn: false, gymName: "RAM'S", memberName: 'Asha Verma', day: '2026-10-15', checkedInAt: 1760531520000 });
    expect(a).toEqual({ ok: true, alreadyIn: false, gymName: "RAM'S", memberName: 'Asha Verma', day: '2026-10-15', checkedInAt: 1760531520000, planOk: null });
    // 0016 says whether a plan covers today; anything but a true/false is "not said".
    expect(checkInFromRow({ ok: true, day: '2026-10-15', checkedInAt: 1, planOk: false })).toMatchObject({ planOk: false });
    expect(checkInFromRow({ ok: true, day: '2026-10-15', checkedInAt: 1, planOk: true })).toMatchObject({ planOk: true });
    expect(checkInFromRow({ ok: true, day: '2026-10-15', checkedInAt: 1, planOk: 'no' })).toMatchObject({ planOk: null });
    // Postgres bigints may arrive as text.
    expect(checkInFromRow({ ok: true, alreadyIn: true, day: '2026-10-15', checkedInAt: '1760531520000' })).toMatchObject({ alreadyIn: true, checkedInAt: 1760531520000, gymName: '' });
  });

  it('reads every problem the server answers', () => {
    for (const p of ['TOO_MANY', 'TOO_MANY_NUMBERS', 'OTHER_GYM', 'BAD_PHONE', 'NO_PHONE', 'GYM_NOT_ONLINE', 'NOT_ON_ROSTER'] as const) {
      expect(checkInFromRow({ error: p, gymName: 'G' })).toEqual({ ok: false, problem: p, gymName: 'G', phone: null });
    }
    expect(checkInFromRow({ error: 'NOT_ON_ROSTER', phone: '+919829012345' })).toMatchObject({ phone: '+919829012345', gymName: null });
  });

  it('refuses anything else', () => {
    expect(checkInFromRow(null)).toBeNull();
    expect(checkInFromRow({ error: 'SOMETHING_NEW' })).toBeNull();
    expect(checkInFromRow({ ok: true, day: 'today', checkedInAt: 1 })).toBeNull();
    expect(checkInFromRow({ ok: true, day: '2026-10-15', checkedInAt: 'soon' })).toBeNull();
  });
});

describe('the words', () => {
  it('says the time like the register', () => {
    const at = new Date(2026, 9, 15, 18, 42).getTime();
    expect(checkInTime(at)).toBe('6:42 pm');
    expect(checkInTime(new Date(2026, 9, 15, 0, 5).getTime())).toBe('12:05 am');
    expect(checkInTime(new Date(2026, 9, 15, 12, 0).getTime())).toBe('12:00 pm');
    expect(doneHeadline({ checkedInAt: at })).toBe("You're in ✓ 6:42 pm");
    expect(doneHeadline({ checkedInAt: NaN })).toBe("You're in ✓");
  });

  it('says where and as whom', () => {
    expect(doneDetail({ alreadyIn: false, gymName: "RAM'S", memberName: 'Asha Verma' })).toBe("Checked in at RAM'S as Asha Verma. Have a good workout.");
    expect(doneDetail({ alreadyIn: true, gymName: "RAM'S", memberName: 'Asha Verma' })).toBe("You were already checked in at RAM'S today. Nothing more to do.");
    expect(checkInTitle("RAM'S")).toBe("Check in at RAM'S");
    expect(checkInTitle(null)).toBe('Check in');
  });

  it('tells a member the gym does not have their number, with the number', () => {
    expect(problemText({ problem: 'NOT_ON_ROSTER', gymName: 'G', phone: '+919829012345' })).toBe(
      "The gym doesn't have your mobile number yet. Ask the desk to add +91 98290 12345 — then scan again.",
    );
    expect(problemText({ problem: 'NOT_ON_ROSTER', gymName: 'G', phone: null }, '9829054321')).toContain('+91 98290 54321');
    expect(problemText({ problem: 'NOT_ON_ROSTER', gymName: 'G', phone: null })).toContain('add your number');
  });

  it('has plain words for every other problem', () => {
    expect(problemText({ problem: 'GYM_NOT_ONLINE', gymName: "RAM'S", phone: null })).toBe("RAM'S doesn't take check-ins in the app yet. Check in at the desk today.");
    expect(problemText({ problem: 'TOO_MANY', gymName: null, phone: null })).toMatch(/Wait a minute/);
    // Too many NUMBERS is not "wait a minute": the limit lasts the day, so it sends them to the desk.
    expect(problemText({ problem: 'TOO_MANY_NUMBERS', gymName: null, phone: null })).toBe(
      'Too many numbers were tried today. Check in at the desk, and ask them to check your mobile number.',
    );
    expect(problemText({ problem: 'BAD_PHONE', gymName: null, phone: null })).toMatch(/10-digit/);
    expect(problemText({ problem: 'OTHER_GYM', gymName: 'G', phone: null })).toBe("You're not a member of G in the app.");
    expect(notMemberText('fresh', "RAM'S", null)).toBe("Join RAM'S in the app first — then scan again to check in.");
    expect(notMemberText('other', "RAM'S", 'Iron Temple')).toBe("You're in Iron Temple in the app, not RAM'S. Join RAM'S first — then scan again.");
  });

  it('says offline and slow plainly, and logs only the unplanned', () => {
    expect(checkInErrorText({ kind: 'offline' })).toBe("No internet. Check in at the desk, or scan again when you're online.");
    expect(checkInErrorText({ kind: 'timeout' })).toMatch(/didn't answer/);
    expect(checkInErrorText({ kind: 'other' })).toMatch(/Couldn't check you in/);
    expect(isRealFailure({ kind: 'offline' })).toBe(false);
    expect(isRealFailure({ kind: 'timeout' })).toBe(false);
    expect(isRealFailure({ kind: 'other' })).toBe(true);
  });
});

describe('checking in (the action)', () => {
  const link = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: "RAM'S", joinCode: 'RAMS01', name: 'Asha' };
  beforeEach(() => {
    sent.length = 0;
    answer = null;
    useGymShop.getState().setLink(link);
  });

  it('sends the key, the cleaned code and a typed number', async () => {
    answer = { ok: true, data: { ok: true, alreadyIn: false, gymName: "RAM'S", memberName: 'Asha', day: '2026-10-15', checkedInAt: 1 } };
    const out = await checkInAtGym('rams01', '9829012345');
    expect(sent).toEqual([{ key: link.memberKey, code: 'RAMS01', phone: '9829012345' }]);
    expect(out).toMatchObject({ kind: 'answer', answer: { ok: true } });
  });

  it('unlinks the phone when the gym no longer knows its key', async () => {
    answer = { ok: false, error: { kind: 'BAD_KEY' } };
    expect(await checkInAtGym('RAMS01', null)).toEqual({ kind: 'unlinked' });
    expect(useGymShop.getState().link).toBeNull();
  });

  it('passes a failed call on, and asks nothing of a phone in no gym', async () => {
    answer = { ok: false, error: { kind: 'offline' } };
    expect(await checkInAtGym('RAMS01', null)).toEqual({ kind: 'failed', error: { kind: 'offline' } });
    useGymShop.getState().unlink(null);
    sent.length = 0;
    expect(await checkInAtGym('RAMS01', null)).toEqual({ kind: 'not-joined' });
    expect(sent).toEqual([]);
  });
});

describe('Android opens the app for the poster link', () => {
  const root = join(__dirname, '..', '..');
  it('in app.json', () => {
    const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
    const filters = app.expo.android.intentFilters as { autoVerify?: boolean; data: { host: string; pathPrefix: string }[] }[];
    const c = filters.find((f) => f.data.some((d) => d.pathPrefix === '/c/'));
    expect(c?.autoVerify).toBe(true);
    expect(c?.data[0].host).toBe('forgeai.aakashpahuja.in');
  });

  it('in the committed AndroidManifest.xml (the cloud build does not regenerate it)', () => {
    const xml = readFileSync(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(xml).toMatch(/<intent-filter android:autoVerify="true">[\s\S]*?android:host="forgeai\.aakashpahuja\.in" android:pathPrefix="\/c\/"[\s\S]*?<\/intent-filter>/);
  });
});
