/**
 * R-522 (owner, 14 Nov 2026): the add-person pop-up on Settings -> Staff & sign-in offers four jobs: Owner, Staff
 * (front desk), Trainer and Other (type the job). ACCESS STAYS TWO LEVELS: only "Owner" gives owner powers; the other
 * three are the front desk's access. Trainer also ticks 0050's Trainer (the same call as the tick on a person's row).
 * Other keeps the typed job ("Manager", "Cleaner") as a name on the person's row only.
 *
 * The typed job is saved on the gym's server by 0079 (owner_set_person_job). Until 0079 is live (it waits for the
 * owner's yes) it is kept on this browser only, and sent once the server has it. PURE except the two small
 * browser-storage helpers at the end, which take the store as an argument.
 */

import type { Role } from '../auth/signin';

export type JobChoice = 'owner' | 'staff' | 'trainer' | 'other';

export const JOB_CHOICES: readonly JobChoice[] = ['owner', 'staff', 'trainer', 'other'];

/** The most a typed job may be (0079's column check). */
export const JOB_MAX = 40;

/** Every word of the pop-up and the row pills (English; the Hinglish is in lang/hinglish.ts). */
export const JOB_WORDS = {
  label: 'What is their job?',
  owner: 'Owner',
  staff: 'Staff (front desk)',
  trainer: 'Trainer',
  other: 'Other',
  otherLabel: 'Type the job (for example Manager, Cleaner)',
  otherMissing: 'Type their job, like Manager or Cleaner.',
  hintOwner: 'Can do everything, including money totals.',
  hintOwnerBranches: 'Can do everything in every branch, including money totals.',
  hintStaff: 'Adds members, collects fees and checks members in. Never sees money totals.',
  hintStaffBranch: 'Works only at this branch: adds members, collects fees and checks members in. Never sees money totals.',
  hintTrainer: 'Same access as the front desk, plus the workout progress of the members you give them.',
  hintOther: 'Same access as the front desk. The job only shows next to their name.',
  pillOwner: 'Owner',
  pillStaff: 'Staff',
  pillTrainer: 'Trainer',
  added: '{name} added. Now make a sign-in code for them.',
  notTrainer: '{name} added with front desk access, but not marked as a trainer yet. Tick Trainer on their row.',
} as const;

/** The access a choice gives. Only "Owner" is ever an owner. PURE. */
export function roleFor(choice: JobChoice): Role {
  return choice === 'owner' ? 'owner' : 'staff';
}

/** The words that say what a choice may do (shown under the drop-down). PURE. */
export function jobHint(choice: JobChoice, branches: boolean): string {
  if (choice === 'owner') return branches ? JOB_WORDS.hintOwnerBranches : JOB_WORDS.hintOwner;
  if (choice === 'trainer') return JOB_WORDS.hintTrainer;
  if (choice === 'other') return JOB_WORDS.hintOther;
  return branches ? JOB_WORDS.hintStaffBranch : JOB_WORDS.hintStaff;
}

/** The typed job, tidied: spaces collapsed, no control characters, at most JOB_MAX; null when empty. PURE. */
export function cleanJob(raw: string | null | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, JOB_MAX).trim() : null;
}

export type PillKind = 'owner' | 'job' | 'trainer' | 'staff';

/**
 * The pill on a person's row: Owner; else their typed job; else Trainer when ticked; else Staff. The words come back
 * in English (draw them through t(), except a typed job, which is the owner's own words). PURE.
 */
export function personPill(p: { role: Role; job?: string | null }, trainer: boolean): { kind: PillKind; text: string } {
  if (p.role === 'owner') return { kind: 'owner', text: JOB_WORDS.pillOwner };
  const job = cleanJob(p.job);
  if (job) return { kind: 'job', text: job };
  if (trainer) return { kind: 'trainer', text: JOB_WORDS.pillTrainer };
  return { kind: 'staff', text: JOB_WORDS.pillStaff };
}

/**
 * The job to show for a person: the server's (0079 live: `job` is a string or null), else the one kept on this
 * browser (`job` undefined: a server before 0079). PURE.
 */
export function jobOf(p: { staffId: string; job?: string | null }, local: Readonly<Record<string, string>>): string | null {
  if (p.job !== undefined) return cleanJob(p.job);
  return cleanJob(local[p.staffId]);
}

/**
 * Once the server has 0079: which jobs kept on this browser still need sending (the person is there with no job on
 * the server), and which can be forgotten (sent already, or the person is gone). Nothing while the server has no
 * 0079 (`job` undefined on the rows). PURE.
 */
export function jobsToSend(
  people: readonly { staffId: string; role: Role; job?: string | null }[],
  local: Readonly<Record<string, string>>,
): { send: { staffId: string; job: string }[]; forget: string[] } {
  const send: { staffId: string; job: string }[] = [];
  const forget: string[] = [];
  if (people.length === 0 || people.some((p) => p.job === undefined)) return { send, forget };
  for (const [staffId, raw] of Object.entries(local)) {
    const p = people.find((x) => x.staffId === staffId);
    const job = cleanJob(raw);
    if (!p || p.role !== 'staff' || !job || cleanJob(p.job) !== null) forget.push(staffId);
    else send.push({ staffId, job });
  }
  return { send, forget };
}

// ---------------------------------------------------------------- kept on this browser (before 0079 is live)

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const localKey = (gymId: string) => `forgeai.staffJobs.v1.${gymId}`;

/** The jobs kept on this browser for a gym: staff id -> job. Empty when none, or storage is blocked. */
export function readLocalJobs(store: Store | null, gymId: string): Record<string, string> {
  if (!store || !gymId) return {};
  try {
    const raw: unknown = JSON.parse(store.getItem(localKey(gymId)) ?? '{}');
    const out: Record<string, string> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const job = typeof v === 'string' ? cleanJob(v) : null;
        if (k && job) out[k] = job;
      }
    }
    return out;
  } catch (e) {
    console.warn('[staff jobs] the jobs kept on this browser could not be read', e);
    return {};
  }
}

/** Keep (or, with null, forget) one person's job on this browser. Returns the new list. */
export function keepLocalJob(store: Store | null, gymId: string, staffId: string, job: string | null): Record<string, string> {
  const next = { ...readLocalJobs(store, gymId) };
  const clean = cleanJob(job);
  if (clean) next[staffId] = clean;
  else delete next[staffId];
  if (store && gymId) {
    try {
      store.setItem(localKey(gymId), JSON.stringify(next));
    } catch (e) {
      console.warn('[staff jobs] could not keep the job on this browser', e);
    }
  }
  return next;
}
