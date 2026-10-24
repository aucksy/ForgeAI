/**
 * Body measurements taken by the trainer at the desk (R-120, 24 Oct 2026). PURE.
 *
 * One entry per member per day: body weight (kg), body fat (%), and the member app's nine tape
 * measurements in cm (the same list and units as apps/mobile/src/tracker/engine/measurements.ts).
 * Saved on the gym's server (supabase/migrations/0035_trainer_measurements_diet.sql); the member sees
 * them in their MettleUp app (Progress → Body) marked "From <gym>". The ranges here are the server's.
 */

export type TapeKind = 'neck' | 'shoulders' | 'chest' | 'arm' | 'forearm' | 'waist' | 'hips' | 'thigh' | 'calf';

/** Form order: the ones trainers take most first, then the rest head to toe. */
export const TAPE_KINDS: readonly TapeKind[] = ['waist', 'chest', 'arm', 'hips', 'thigh', 'neck', 'shoulders', 'forearm', 'calf'];

export const TAPE_LABEL: Record<TapeKind, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  chest: 'Chest',
  arm: 'Arm',
  forearm: 'Forearm',
  waist: 'Waist',
  hips: 'Hips',
  thigh: 'Thigh',
  calf: 'Calf',
};

/** The server's limits (0035 _measure_clean). */
export const LIMITS = {
  weightKg: [20, 350],
  bodyFat: [2, 75],
  tape: [5, 300],
} as const;

export interface BodyMeasure {
  id: string;
  memberId: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  weightKg: number | null;
  bodyFat: number | null;
  tape: Partial<Record<TapeKind, number>>;
  /** The desk's own note; never sent to the member. */
  note: string | null;
  /** Who measured ("Ravi"); null for an old owner key. */
  byName: string | null;
  updatedAt: number;
}

export function isTapeKind(v: unknown): v is TapeKind {
  return typeof v === 'string' && (TAPE_KINDS as readonly string[]).includes(v);
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** One row from the server, or null when it can't be read. */
export function measureFromRow(raw: unknown): BodyMeasure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const date = str(r.date);
  if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const tape: Partial<Record<TapeKind, number>> = {};
  if (r.tape && typeof r.tape === 'object' && !Array.isArray(r.tape)) {
    for (const [k, v] of Object.entries(r.tape as Record<string, unknown>)) {
      const n = num(v);
      if (isTapeKind(k) && n != null) tape[k] = n;
    }
  }
  return {
    id,
    memberId: str(r.memberId) ?? '',
    date,
    weightKg: num(r.weightKg),
    bodyFat: num(r.bodyFat),
    tape,
    note: str(r.note),
    byName: str(r.byName),
    updatedAt: num(r.updatedAt) ?? 0,
  };
}

/** The server's list (newest day first), unreadable rows dropped. */
export function measuresFromRows(raw: unknown): BodyMeasure[] {
  const list = Array.isArray(raw) ? raw.map(measureFromRow).filter((m): m is BodyMeasure => m != null) : [];
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------------------------------------------------------------- the form

/** What the trainer typed: every box is text. */
export interface MeasureDraft {
  id?: string;
  date: string;
  weightKg: string;
  bodyFat: string;
  tape: Partial<Record<TapeKind, string>>;
  note: string;
}

export function emptyMeasureDraft(today: string): MeasureDraft {
  return { date: today, weightKg: '', bodyFat: '', tape: {}, note: '' };
}

const shown = (n: number | null | undefined): string => (n == null ? '' : String(Math.round(n * 10) / 10));

export function draftOfMeasure(m: BodyMeasure): MeasureDraft {
  const tape: Partial<Record<TapeKind, string>> = {};
  for (const k of TAPE_KINDS) if (m.tape[k] != null) tape[k] = shown(m.tape[k]);
  return { id: m.id, date: m.date, weightKg: shown(m.weightKg), bodyFat: shown(m.bodyFat), tape, note: m.note ?? '' };
}

/** A typed number: null for blank, NaN for not a number. A comma works as the decimal point. */
export function parseBox(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return Number.NaN;
  return Math.round(parseFloat(t) * 10) / 10;
}

export interface MeasurePayload {
  id?: string;
  date: string;
  weightKg: number | null;
  bodyFat: number | null;
  tape: Partial<Record<TapeKind, number>>;
  note: string | null;
}

/** The form → what Save sends, or the problems in plain words (one per box). */
export function measurePayload(d: MeasureDraft, today: string): { payload: MeasurePayload | null; problems: Record<string, string> } {
  const problems: Record<string, string> = {};
  const box = (key: string, label: string, text: string, [lo, hi]: readonly [number, number], unit: string): number | null => {
    const v = parseBox(text);
    if (v == null) return null;
    if (Number.isNaN(v) || v < lo || v > hi) {
      problems[key] = `${label}: a number from ${lo} to ${hi} ${unit}.`;
      return null;
    }
    return v;
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) problems.date = 'Pick the day it was measured.';
  else if (d.date > today) problems.date = 'The day can’t be in the future.';
  const weightKg = box('weightKg', 'Body weight', d.weightKg, LIMITS.weightKg, 'kg');
  const bodyFat = box('bodyFat', 'Body fat', d.bodyFat, LIMITS.bodyFat, '%');
  const tape: Partial<Record<TapeKind, number>> = {};
  for (const k of TAPE_KINDS) {
    const v = box(k, TAPE_LABEL[k], d.tape[k] ?? '', LIMITS.tape, 'cm');
    if (v != null) tape[k] = v;
  }
  const note = d.note.replace(/\s+/g, ' ').trim();
  if (note.length > 200) problems.note = 'Note: up to 200 letters.';
  if (Object.keys(problems).length > 0) return { payload: null, problems };
  if (weightKg == null && bodyFat == null && Object.keys(tape).length === 0) {
    return { payload: null, problems: { empty: 'Type at least one measurement.' } };
  }
  const payload: MeasurePayload = { date: d.date, weightKg, bodyFat, tape, note: note || null };
  if (d.id) payload.id = d.id;
  return { payload, problems };
}

// ---------------------------------------------------------------- the history

export interface MeasureLine {
  key: 'weightKg' | 'bodyFat' | TapeKind;
  label: string;
  value: number;
  unit: 'kg' | '%' | 'cm';
  /** Change since the member's previous entry that had this measurement (null: first time). */
  change: number | null;
}

/** "−1.5", "+0.4", "0": a change with its sign (a real minus sign). */
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}`;
}

/**
 * Each entry's values, each with its change since the previous entry that had it ("change vs last
 * time"). `list` is newest first (as the server sends it); so is the answer. PURE.
 */
export function measureLines(list: readonly BodyMeasure[]): { entry: BodyMeasure; lines: MeasureLine[] }[] {
  const oldestFirst = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const last = new Map<string, number>();
  const out: { entry: BodyMeasure; lines: MeasureLine[] }[] = [];
  for (const e of oldestFirst) {
    const lines: MeasureLine[] = [];
    const add = (key: MeasureLine['key'], label: string, value: number | null | undefined, unit: MeasureLine['unit']) => {
      if (value == null) return;
      const before = last.get(key);
      lines.push({ key, label, value, unit, change: before == null ? null : Math.round((value - before) * 10) / 10 });
      last.set(key, value);
    };
    add('weightKg', 'Body weight', e.weightKg, 'kg');
    add('bodyFat', 'Body fat', e.bodyFat, '%');
    for (const k of TAPE_KINDS) add(k, TAPE_LABEL[k], e.tape[k], 'cm');
    out.push({ entry: e, lines });
  }
  return out.reverse();
}

/** "72.5 kg", "24 %", "84 cm". */
export function valueText(l: Pick<MeasureLine, 'value' | 'unit'>): string {
  return `${Math.round(l.value * 10) / 10}${l.unit === '%' ? ' %' : ` ${l.unit}`}`;
}

// ---------------------------------------------------------------- errors

/** A refusal from 0035 in plain words, or null when it is not one of its codes. */
export function measureErrorWords(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  if (/\bDAY_TAKEN\b/.test(msg)) return 'This member already has measurements on that day. Edit that entry instead.';
  if (/\bBAD_DATE\b/.test(msg)) return 'Pick a day that is today or before.';
  if (/\bEMPTY\b/.test(msg)) return 'Type at least one measurement.';
  if (/\bNO_MEMBER\b/.test(msg)) return 'This member is not on your gym’s list any more.';
  if (/\bNOT_FOUND\b/.test(msg)) return 'That entry was deleted on another device. Close this and look again.';
  if (/\bINVALID\b/.test(msg)) return 'One of the numbers is outside what a body can be. Check them and try again.';
  return null;
}
