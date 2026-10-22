/**
 * Offline front desk, step 1 (owner #7, built R-55, 22 Oct 2026): a copy of the ONLINE gym kept on
 * this device, so the panel still opens and every member, plan and due can be looked up when the
 * internet is down. Saving waits for the internet (step 2 sends check-ins later; payments and new
 * members need a receipt-number series of their own per desk first: a tax invoice's number must
 * never change after it is printed).
 *
 * Where: IndexedDB in this browser (a gym is far past localStorage's ~5 MB with years of
 * receipts). Which gym: the copy is filed under a one-way hash of the device's sign-in key, so
 * another gym's key (or none) can never open it. Gone: on sign-out, when the key stops working, or
 * when the owner removes this device (cloud.ts calls `clear`).
 *
 * It holds the same records the panel shows on screen, on the same desk device. The gym's privacy
 * notice says so (docs/launch/PRIVACY-NOTICE.md and -HI.md, "Where it is kept").
 */
import type { CloudGymRow, CrmRecord, Rows } from './cloud';

export interface SavedGym {
  /** Shape of this file; another number is ignored (never half-read). */
  v: 1;
  /** Epoch ms of the last good copy ("Last updated 7:42 pm"). */
  savedAt: number;
  version: number;
  gym: CloudGymRow;
  records: CrmRecord[];
}

export interface SavedCopyStore {
  load(id: string): Promise<SavedGym | null>;
  save(id: string, copy: SavedGym): Promise<void>;
  clear(): Promise<void>;
}

/** Every row of `rows` as records (the same shape a pull brings), ready to keep. PURE. */
export function rowsToRecords(rows: Rows): CrmRecord[] {
  const out: CrmRecord[] = [];
  if (rows.gym) out.push({ k: 'gym', id: 'gym', d: rows.gym });
  for (const kind of ['member', 'plan', 'membership', 'payment', 'visit', 'enquiry', 'expense', 'workout_plan'] as const) {
    for (const [id, d] of rows[kind]) out.push({ k: kind, id, d });
  }
  return out;
}

/** A kept copy that can be used: this file's shape, with a gym and a list. PURE. */
export function usableCopy(raw: unknown): SavedGym | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<SavedGym>;
  if (c.v !== 1 || typeof c.version !== 'number' || typeof c.savedAt !== 'number') return null;
  if (!c.gym || typeof c.gym.gymId !== 'string' || !Array.isArray(c.records)) return null;
  return c as SavedGym;
}

/** A one-way name for the sign-in key (FNV-1a, 2 x 32 bits): files the copy, never reveals the key. PURE. */
export function keyId(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ key.length;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000197) >>> 0;
  }
  return `g${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Is this failure "no internet" (not a refusal from the server)? PURE. */
export function isNetworkFailure(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err
        ? String((err as { message?: unknown }).message ?? '')
        : String(err ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|could not be reached/i.test(msg);
}

const DB = 'forgeai-offline';
const STORE = 'gyms';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('offline copy could not be opened'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error('offline copy not saved'));
        };
      }),
  );
}

/** The browser's own store (IndexedDB). One gym per device: a save replaces any older copy. */
export function browserSavedCopy(): SavedCopyStore | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  return {
    async load(id) {
      return usableCopy(await tx('readonly', (s) => s.get(id)));
    },
    async save(id, copy) {
      await tx('readwrite', (s) => s.clear());
      await tx('readwrite', (s) => s.put(copy, id));
    },
    async clear() {
      await tx('readwrite', (s) => s.clear());
    },
  };
}
