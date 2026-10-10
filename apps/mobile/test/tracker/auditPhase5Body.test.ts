/**
 * Audit Phase 5, packet B — body tools that forgive mistakes, photos you never lose, and a
 * share picture that is yours.
 *
 *  - PG-03 / PG-16: a body-weight or measurement entry can be fixed, re-dated, deleted (with
 *    an undo that puts it back), and logged for an earlier day; a 765 kg typo gets one gentle
 *    question; a photo's date can be set, and a photo with no date of its own says so.
 *  - PG-17 / D11: the opt-in photo backup keeps the NEWEST photos that fit a budget that keeps
 *    Android's whole backup well under its 25 MB limit, and a fresh install relinks photos
 *    from that folder.
 *  - PG-04: the share picture carries the workout's real name, never "Full Body" for a run.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bodyWeightTypo, bodyWeightTypoText } from '@/tracker/engine/bodyCheck';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { workoutName } from '@/tracker/services/finishSummary';
import {
  MB,
  photoBackupLine,
  photoBudgetBytes,
  pickNewestThatFit,
} from '@/tracker/services/photoBackupPlan';
import { keepPhoto, type KeepDeps } from '@/tracker/services/progressPhotos';
import { sceneTexts } from '@/tracker/share/scene';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { liftedOnPicture, workoutShareInput } from '@/tracker/share/workoutInput';
import { bootRealApp, type RealDb } from '../helpers/realDb';

// ------------------------------------------------------------------ the gentle typo question
describe('PG-03: a body-weight typo gets one gentle question, never a refusal', () => {
  const history = [
    { id: 'a', dateISO: '2026-10-01', weightKg: 76.5 },
    { id: 'b', dateISO: '2026-10-05', weightKg: 76.0 },
  ];

  it('765 kg after 76.5 kg asks "that\'s 10× your last" (before: saved without a word, feeding pull-up kilos)', () => {
    const hit = bodyWeightTypo(765, history, { dateISO: '2026-10-02' });
    expect(hit).not.toBeNull();
    expect(bodyWeightTypoText(hit!, 765, 'metric')).toBe('765 kg — that\'s 10× your last. Keep it?');
  });

  it('compares with the entry before the chosen day, and leaves the entry being edited out', () => {
    // Editing 'b' itself to 760: its own old value is not "your last".
    const hit = bodyWeightTypo(760, history, { dateISO: '2026-10-05', excludeId: 'b' });
    expect(hit?.lastKg).toBe(76.5);
  });

  it('a slip the other way (7.6 for 76) asks too; an ordinary change does not', () => {
    const low = bodyWeightTypo(7.6, history, { dateISO: '2026-10-06' });
    expect(bodyWeightTypoText(low!, 7.6, 'metric')).toBe('7.6 kg — that\'s far below your last (76 kg). Keep it?');
    expect(bodyWeightTypo(78, history, { dateISO: '2026-10-06' })).toBeNull();
    expect(bodyWeightTypo(70, history, { dateISO: '2026-10-06' })).toBeNull();
  });

  it('speaks pounds to a member who uses pounds', () => {
    const hit = bodyWeightTypo(765, history, { dateISO: '2026-10-06' });
    expect(bodyWeightTypoText(hit!, 765, 'imperial')).toMatch(/^1,?686\.5 lb — that's 10× your last\. Keep it\?$/);
  });

  it('a first weigh-in is only asked about when it is far outside any body weight', () => {
    expect(bodyWeightTypo(80, [], { dateISO: '2026-10-06' })).toBeNull();
    const hit = bodyWeightTypo(765, [], { dateISO: '2026-10-06' });
    expect(bodyWeightTypoText(hit!, 765, 'metric')).toBe('765 kg — that\'s not a usual body weight. Keep it?');
  });
});

// ------------------------------------------------------------------ editing body entries against real SQL
const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

describe('PG-03 / PG-16: fix, re-date, delete and undo — real SQL', () => {
  let db: RealDb;
  beforeEach(async () => {
    db = await bootRealApp();
    const { completeOnboarding } = await import('@/onboarding/db/dataActions');
    await completeOnboarding(MEMBER);
    db.raw.run('DELETE FROM body_weight');
  });

  it('a 765 kg entry is corrected in place; Home and Progress read the fixed value', async () => {
    const q = await import('@/db/queuedWrites');
    const body = await import('@/tracker/db/bodyEntries');
    const user = await import('@/db/repos/userRepo');
    const e = await q.logBodyWeight('2026-10-08', 765);
    await body.editBodyWeight(e.id, { dateISO: '2026-10-08', weightKg: 76.5 });
    expect((await user.getLatestBodyWeight())?.weightKg).toBe(76.5);
    expect(await user.getBodyWeightHistory()).toHaveLength(1);
  });

  it('logs for an earlier day, and re-dates an entry; moving onto a day that has one replaces it', async () => {
    const q = await import('@/db/queuedWrites');
    const body = await import('@/tracker/db/bodyEntries');
    const user = await import('@/db/repos/userRepo');
    await q.logBodyWeight('2026-10-01', 77);
    const b = await q.logBodyWeight('2026-10-08', 76);
    const out = await body.editBodyWeight(b.id, { dateISO: '2026-10-01', weightKg: 76 });
    expect(out.replaced?.weightKg).toBe(77);
    const h = await user.getBodyWeightHistory();
    expect(h.map((x) => [x.dateISO, x.weightKg])).toEqual([['2026-10-01', 76]]);
  });

  it('a delete can be undone — the same entry comes back', async () => {
    const q = await import('@/db/queuedWrites');
    const body = await import('@/tracker/db/bodyEntries');
    const user = await import('@/db/repos/userRepo');
    const e = await q.logBodyWeight('2026-10-03', 79);
    await body.deleteBodyWeight(e.id);
    expect(await user.getBodyWeightHistory()).toHaveLength(0);
    await body.restoreBodyWeight(e);
    expect(await user.getBodyWeightHistory()).toEqual([e]);
  });

  it('a future day is never saved', async () => {
    const body = await import('@/tracker/db/bodyEntries');
    const q = await import('@/db/queuedWrites');
    const e = await q.logBodyWeight('2026-10-03', 79);
    await expect(body.editBodyWeight(e.id, { dateISO: '2999-01-01', weightKg: 79 })).rejects.toThrow(/future/);
  });

  it('a measurement is corrected and re-dated; a delete is undone', async () => {
    const m = await import('@/tracker/db/measurementRepo');
    const body = await import('@/tracker/db/bodyEntries');
    await m.logMeasurements('2026-10-01', { waist: 82 });
    await m.logMeasurements('2026-10-08', { waist: 820 });
    const typo = (await m.getMeasurements()).find((x) => x.value === 820)!;
    await body.editMeasurement(typo.id, { dateISO: '2026-10-07', value: 81 });
    expect((await m.getMeasurements()).map((x) => [x.dateISO, x.value])).toEqual([
      ['2026-10-01', 82],
      ['2026-10-07', 81],
    ]);
    const first = (await m.getMeasurements())[0];
    await m.deleteMeasurement(first.id);
    await body.restoreMeasurement(first);
    expect((await m.getMeasurements()).map((x) => x.value)).toEqual([82, 81]);
  });

  it("a photo's date can be set", async () => {
    const body = await import('@/tracker/db/bodyEntries');
    const { getProgressPhotos } = await import('@/tracker/services/progressPhotos');
    db.raw.run("INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES('p1', '2026-10-10', 'file:///docs/progress-photos/p1.jpg', 1)");
    await body.setPhotoDate('p1', '2026-01-15');
    expect((await getProgressPhotos())[0].dateISO).toBe('2026-01-15');
  });
});

// ------------------------------------------------------------------ a photo without a date says so
describe('PG-16: a picture with no date of its own is flagged, not silently dated today', () => {
  const deps = (): KeepDeps => ({
    dir: 'file:///docs/progress-photos/',
    cacheDir: 'file:///cache/',
    mkdir: async () => undefined,
    copy: async () => undefined,
    remove: async () => undefined,
    insert: async () => undefined,
    newId: () => 'p1',
    today: '2026-10-10',
    now: 1,
  });
  it('no EXIF date → undated (the screen then asks for the day)', async () => {
    const p = await keepPhoto({ uri: 'file:///cache/a.jpg', exif: null }, deps());
    expect(p.dateISO).toBe('2026-10-10');
    expect(p.undated).toBe(true);
  });
  it('an EXIF date → dated, nothing to ask', async () => {
    const p = await keepPhoto({ uri: 'file:///cache/a.jpg', exif: { DateTimeOriginal: '2026:01:15 07:42:10' } }, deps());
    expect(p.dateISO).toBe('2026-01-15');
    expect(p.undated).toBe(false);
  });
});

// ------------------------------------------------------------------ the photo backup budget
describe('PG-17 / D11: the photo backup keeps the newest photos that fit', () => {
  it('the budget is at most 15 MB, and shrinks so photos plus the database stay under 22 MB', () => {
    expect(photoBudgetBytes(2 * MB)).toBe(15 * MB);
    expect(photoBudgetBytes(9 * MB)).toBe(13 * MB);
    expect(photoBudgetBytes(30 * MB)).toBe(0);
  });

  it('newest first, stopping at the first that does not fit (so it is always "your newest N")', () => {
    const photos = [
      { id: 'old', dateISO: '2026-01-01', createdAt: 1, bytes: 1 * MB },
      { id: 'new', dateISO: '2026-10-01', createdAt: 5, bytes: 6 * MB },
      { id: 'mid', dateISO: '2026-05-01', createdAt: 3, bytes: 6 * MB },
      { id: 'mid2', dateISO: '2026-05-01', createdAt: 4, bytes: 6 * MB },
    ];
    const pick = pickNewestThatFit(photos, 15 * MB);
    expect(pick.keep).toEqual(['new', 'mid2']);
    expect(pick.bytes).toBe(12 * MB);
    expect(pick.total).toBe(4);
  });

  it('says what it backs up in plain words', () => {
    expect(photoBackupLine({ kept: 42, total: 60, bytes: 15 * MB })).toBe('Backing up your newest 42 photos (15 MB). Older ones stay on this phone only.');
    expect(photoBackupLine({ kept: 12, total: 12, bytes: 8.4 * MB })).toBe('Backing up all 12 photos (8.4 MB).');
    expect(photoBackupLine({ kept: 1, total: 1, bytes: 0.6 * MB })).toBe('Backing up your 1 photo (0.6 MB).');
    expect(photoBackupLine({ kept: 0, total: 0, bytes: 0 })).toBe('No photos to back up yet.');
    expect(photoBackupLine({ kept: 0, total: 3, bytes: 0 })).toBe('No room for photos: your workouts fill the backup. Use "Save to phone gallery" instead.');
  });
});

// ------------------------------------------------------------------ sync + relink against real SQL
/** A stand-in phone folder: path → size in bytes. */
function fakeFs(files: Record<string, number>) {
  const map = new Map(Object.entries(files));
  const dirs = new Set<string>();
  return {
    map,
    docDir: 'file:///docs/',
    size: async (uri: string) => map.get(uri) ?? null,
    isDir: async (uri: string) => dirs.has(uri) || [...map.keys()].some((k) => k.startsWith(uri)),
    copy: async (from: string, to: string) => {
      const s = map.get(from);
      if (s == null) throw new Error(`no file ${from}`);
      map.set(to, s);
    },
    remove: async (uri: string) => {
      for (const k of [...map.keys()]) if (k === uri || k.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) map.delete(k);
    },
    mkdir: async (dir: string) => {
      dirs.add(dir);
    },
    list: async (dir: string) =>
      [...map.keys()].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/')).map((k) => k.slice(dir.length)),
  };
}

describe('PG-17 / D11: backup copies and the relink after a fresh install — real SQL', () => {
  let db: RealDb;
  beforeEach(async () => {
    db = await bootRealApp();
  });
  const addRow = (id: string, date: string, created: number, ext = 'jpg') =>
    db.raw.run('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [id, date, `file:///docs/progress-photos/${id}.${ext}`, created]);

  it('copies the newest photos that fit into photo-backup/, and removes copies that no longer fit', async () => {
    const { setPhotoBackupOn, syncPhotoBackup } = await import('@/tracker/services/photoBackup');
    addRow('a', '2026-01-01', 1);
    addRow('b', '2026-05-01', 2);
    addRow('c', '2026-10-01', 3);
    const fs = fakeFs({
      'file:///docs/SQLite/forgeai.db': 2 * MB,
      'file:///docs/progress-photos/a.jpg': 5 * MB,
      'file:///docs/progress-photos/b.jpg': 7 * MB,
      'file:///docs/progress-photos/c.jpg': 7 * MB,
      'file:///docs/photo-backup/a.jpg': 5 * MB, // from an earlier sync, before b and c
    });
    await setPhotoBackupOn(true, fs);
    const s = await syncPhotoBackup(fs);
    expect(s).toEqual({ kept: 2, total: 3, bytes: 14 * MB, failed: 0 });
    expect(fs.map.has('file:///docs/photo-backup/c.jpg')).toBe(true);
    expect(fs.map.has('file:///docs/photo-backup/b.jpg')).toBe(true);
    expect(fs.map.has('file:///docs/photo-backup/a.jpg')).toBe(false);
  });

  it('shrunk copies: far more of the newest photos fit (a 7 MB photo becomes ~0.2 MB)', async () => {
    const { setPhotoBackupOn, syncPhotoBackup } = await import('@/tracker/services/photoBackup');
    for (let i = 0; i < 40; i++) addRow(`p${i}`, `2026-0${1 + (i % 9)}-1${i % 10}`, i);
    const files: Record<string, number> = { 'file:///docs/SQLite/forgeai.db': 2 * MB };
    for (let i = 0; i < 40; i++) files[`file:///docs/progress-photos/p${i}.jpg`] = 7 * MB;
    const fs = fakeFs(files);
    const shrink = async (_from: string, to: string) => {
      fs.map.set(to, 0.2 * MB);
    };
    await setPhotoBackupOn(true, fs);
    const s = await syncPhotoBackup({ ...fs, shrink });
    expect(s.kept).toBe(40); // 40 × 0.2 MB = 8 MB, under the 15 MB budget (full size: 2 photos)
    expect(s.total).toBe(40);
  });

  it('a photo that cannot be shrunk is never copied full-size: it "could not be copied" (review fix: the as-is copy ate the budget)', async () => {
    const { setPhotoBackupOn, syncPhotoBackup } = await import('@/tracker/services/photoBackup');
    addRow('x', '2026-10-01', 1);
    const fs = fakeFs({ 'file:///docs/SQLite/forgeai.db': 2 * MB, 'file:///docs/progress-photos/x.jpg': 3 * MB });
    await setPhotoBackupOn(true, fs);
    const s = await syncPhotoBackup({ ...fs, shrink: async () => { throw new Error('no decoder'); } });
    expect(s).toEqual({ kept: 0, total: 1, bytes: 0, failed: 1 });
    expect(fs.map.has('file:///docs/photo-backup/x.jpg')).toBe(false);
  });

  it('a fresh install with the backup folder relinks the photos (before: every photo gone)', async () => {
    const { relinkPhotosFromBackup } = await import('@/tracker/services/photoBackup');
    const { getProgressPhotos } = await import('@/tracker/services/progressPhotos');
    // The database came back with Android's backup; the photo folder did not, the backup folder did.
    addRow('a', '2026-01-01', 1);
    addRow('b', '2026-05-01', 2, 'png');
    db.raw.run("UPDATE progress_photos SET uri = 'file:///old-phone/files/progress-photos/b.png' WHERE id = 'b'");
    const fs = fakeFs({ 'file:///docs/photo-backup/a.jpg': 1 * MB, 'file:///docs/photo-backup/b.png': 1 * MB });
    expect(await relinkPhotosFromBackup(fs)).toBe(2);
    expect(fs.map.has('file:///docs/progress-photos/a.jpg')).toBe(true);
    expect(fs.map.has('file:///docs/progress-photos/b.png')).toBe(true);
    const rows = await getProgressPhotos();
    expect(rows.map((r) => r.uri).sort()).toEqual(['file:///docs/progress-photos/a.jpg', 'file:///docs/progress-photos/b.png']);
    // Nothing missing → nothing done.
    expect(await relinkPhotosFromBackup(fs)).toBe(0);
  });

  it('turning it on remembers the choice; turning it off deletes the folder', async () => {
    const pb = await import('@/tracker/services/photoBackup');
    const fs = fakeFs({ 'file:///docs/photo-backup/a.jpg': 1 * MB });
    expect(await pb.isPhotoBackupOn()).toBe(false); // default OFF
    await pb.setPhotoBackupOn(true, fs);
    expect(await pb.isPhotoBackupOn()).toBe(true);
    await pb.setPhotoBackupOn(false, fs);
    expect(await pb.isPhotoBackupOn()).toBe(false);
    expect(fs.map.size).toBe(0);
  });
});

// ------------------------------------------------------------------ the share picture's name
type Kind = SessionSummaryData['kinds'][string];
const RUN: Kind = { logType: 'time_distance', loadMode: 'one', distUnit: 'km', catalogKey: 'treadmill_run', bwShare: 0 };
const PLANK: Kind = { logType: 'time', loadMode: 'one', distUnit: 'km', catalogKey: 'plank', bwShare: 0 };
const PULL_UP: Kind = { logType: 'reps', loadMode: 'one', distUnit: 'km', catalogKey: 'pull_up', bwShare: 1 };
const CURL: Kind = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', catalogKey: 'barbell_curl', bwShare: 0 };

function summary(
  groups: { id: string; name: string; kind: Kind; sets: { kg?: number; reps?: number; sec?: number; m?: number }[] }[],
  extra: { title?: string | null; routineName?: string | null; dayType?: string; muscles?: SessionSummaryData['muscles'] } = {},
): SessionSummaryData {
  let k = 0;
  const setMeta: SessionSummaryData['setMeta'] = {};
  const session = {
    id: 'w1',
    dateISO: '2026-10-07',
    startedAt: 0,
    endedAt: 1_800_000,
    dayType: (extra.dayType ?? 'full') as SessionSummaryData['session']['dayType'],
    notes: null,
    source: 'manual' as const,
    title: extra.title ?? null,
    exercises: groups.map((g) => ({
      exercise: { id: g.id, name: g.name, aliases: [], muscleGroup: 'back' as const, secondaryMuscles: [], equipment: 'bodyweight' as const, isCompound: true, incrementKg: 2.5 },
      sets: g.sets.map((s, i) => {
        const id = `s${++k}`;
        setMeta[id] = { rpe: null, setType: 'normal', note: null, durationSec: s.sec ?? null, distanceM: s.m ?? null } as SessionSummaryData['setMeta'][string];
        return { id, sessionId: 'w1', exerciseId: g.id, setNumber: i + 1, weightKg: s.kg ?? 0, reps: s.reps ?? 0, isWarmup: false };
      }),
      volumeKg: 0,
    })),
    totalVolumeKg: 0,
  };
  return {
    session,
    durationSec: 1800,
    totalVolumeKg: 0,
    workingSetCount: groups.reduce((n, g) => n + g.sets.length, 0),
    exerciseCount: groups.length,
    prs: [],
    records: [],
    muscles: extra.muscles ?? [],
    setMeta,
    kinds: Object.fromEntries(groups.map((g) => [g.id, g.kind])),
    needsBodyweight: false,
    routineName: extra.routineName ?? null,
  } as SessionSummaryData;
}

describe('PG-04: the share picture carries the workout\'s real name', () => {
  it('a treadmill run from an empty workout is named after the run, never "Full Body" (phone run 75)', () => {
    const d = summary([{ id: 'run', name: 'Treadmill Run', kind: RUN, sets: [{ sec: 1500, m: 5000 }] }]);
    expect(workoutName(d)).toBe('Treadmill Run');
    const t = sceneTexts(workoutShareScene(workoutShareInput(d)));
    expect(t).not.toContain('Full Body');
    expect(t).toContain('Treadmill Run');
    expect(liftedOnPicture(d)).toEqual({ label: 'DISTANCE', value: '5 km' });
  });

  it('a timed-only workout shows its time, not "EXERCISES 1"', () => {
    const d = summary([{ id: 'pl', name: 'Plank', kind: PLANK, sets: [{ sec: 60 }, { sec: 90 }] }]);
    expect(liftedOnPicture(d)).toEqual({ label: 'TIME', value: '2:30' });
  });

  it('one pull-up set from an empty workout is "Pull Up" (phone run 62)', () => {
    const d = summary([{ id: 'pu', name: 'Pull Up', kind: PULL_UP, sets: [{ reps: 8 }] }]);
    expect(workoutName(d)).toBe('Pull Up');
  });

  it('several exercises with no name: the muscles they trained', () => {
    const d = summary(
      [
        { id: 'pu', name: 'Pull Up', kind: PULL_UP, sets: [{ reps: 8 }] },
        { id: 'cu', name: 'Barbell Curl', kind: CURL, sets: [{ kg: 30, reps: 10 }] },
      ],
      { muscles: [{ muscle: 'lats', sets: 1 }, { muscle: 'biceps', sets: 1.5 }] },
    );
    expect(workoutName(d)).toBe('Biceps & Lats');
  });

  it('the name typed at Finish wins, then the routine\'s own name ("Push 1", not "Push Day")', () => {
    const groups = [{ id: 'cu', name: 'Barbell Curl', kind: CURL, sets: [{ kg: 30, reps: 10 }] }];
    expect(workoutName(summary(groups, { title: 'Arms blast', routineName: 'Push 1', dayType: 'push' }))).toBe('Arms blast');
    expect(workoutName(summary(groups, { routineName: 'Push 1', dayType: 'push' }))).toBe('Push 1');
    // An older workout with neither keeps its day type.
    expect(workoutName(summary(groups, { dayType: 'push' }))).toBe('Push Day');
  });

  it('privacy: a pull-up + curl picture never prints kilos that divide back to body weight', () => {
    const d = summary([
      { id: 'pu', name: 'Pull Up', kind: PULL_UP, sets: [{ reps: 10 }, { reps: 10 }] },
      { id: 'cu', name: 'Barbell Curl', kind: CURL, sets: [{ kg: 30, reps: 10 }] },
    ]);
    // Only the bar: 30 × 10 = 300.
    expect(liftedOnPicture(d)).toEqual({ label: 'KG LIFTED', value: '300' });
  });
});

// ------------------------------------------------------------------ source-text checks for the screens
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', '..', 'src', p), 'utf8');

describe('[source-text check] the body screens', () => {
  it('PG-18: Compare shows each photo whole (contain), never cropped (before: cover in 3:4 boxes)', () => {
    const s = src('app/photos/compare.tsx');
    expect(s).not.toContain('contentFit="cover"');
    expect(s).toContain('contentFit="contain"');
    expect(s).toContain('<ZoomImage');
  });

  it('PG-03 / PG-16: body weight logs for a chosen day and its history rows open the fix sheet', () => {
    const s = src('app/bodyweight.tsx');
    expect(s).not.toContain('logBodyWeight(todayISO()');
    expect(s).toContain('<BodyEntrySheet');
    expect(s).toContain('<UndoBar');
    expect(src('app/measurements/log.tsx')).not.toContain('logMeasurements(todayISO()');
    expect(src('app/measurements/index.tsx')).not.toContain('Alert.alert');
  });

  it('PG-17: each photo can be saved out, and Profile → Backup offers the opt-in', () => {
    expect(src('app/photos/index.tsx')).toContain('Save to phone gallery');
    expect(src('components/settings/BackupCard.tsx')).toContain('<PhotoBackupCard');
    expect(src('components/settings/PhotoBackupCard.tsx')).toContain('Include photos in my backup');
  });
});

// ------------------------------------------------------------------ PG-26: Measurements opens on what Progress showed
import { shownMeasure } from '@/tracker/engine/measurements';

describe('PG-26: Measurements opens on the measurement Progress showed', () => {
  const logged = ['chest', 'waist', 'arm'] as const;
  it('the kind passed in wins when it has entries (before: always the first)', () => {
    expect(shownMeasure([...logged], null, 'waist')).toBe('waist');
  });
  it('a tap on another measurement wins over the one it opened with', () => {
    expect(shownMeasure([...logged], 'arm', 'waist')).toBe('arm');
  });
  it('no, unknown or unlogged kind: the first with entries', () => {
    expect(shownMeasure([...logged], null, undefined)).toBe('chest');
    expect(shownMeasure([...logged], null, 'nonsense')).toBe('chest');
    expect(shownMeasure(['chest'], null, 'waist')).toBe('chest');
    expect(shownMeasure([], null, 'waist')).toBeNull();
  });
});
