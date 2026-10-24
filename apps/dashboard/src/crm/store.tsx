/**
 * CRM state — one snapshot in memory, plus the actions that mutate it.
 *
 * Every write goes through the adapter and then re-reads the snapshot, so the UI
 * can never drift from what was actually persisted. A gym is small enough that a
 * full re-read costs nothing, and "what's on screen is what's in the database" is
 * worth far more here than a clever optimistic-update path that can lie about
 * whether a payment was recorded.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  CrmData,
  CrmSnapshot,
  GymRecord,
  RecordPaymentInput,
  SellMembershipInput,
  SellMembershipResult,
  ImportTermItem,
  ImportTermsResult,
  UndoImportResult,
} from './data/adapter';
import { DamagedDataError } from './data/adapter';
import type { DeskState, OfflineState } from './data/cloud';
import { DeskBar } from './ui/offline';
import { OfflineContext, type OfflineInfo } from './ui/offlineContext';
import { demoSnapshot } from './data/demo';
import { downloadTextFile } from './ui/download';
import { emptySnapshot, LocalCrmData } from './data/local';
import { todayISO, type DateISO } from './logic/dates';
import { color } from '../theme';
import { buildMemberView } from './logic/membership';
import type {
  Enquiry,
  EnquiryDraft,
  ExpenseDraft,
  Member,
  MemberDraft,
  MemberView,
  Payment,
  PlanDraft,
  Visit,
  WorkoutPlan,
  WorkoutPlanDraft,
} from './types';

interface CrmContextValue {
  snapshot: CrmSnapshot;
  /**
   * Today. Re-resolved whenever the tab regains focus, so a front desk that
   * leaves the CRM open overnight does not record tomorrow's check-ins and
   * receipts against yesterday.
   */
  today: DateISO;
  loading: boolean;
  error: string | null;

  /** Active roster: every non-archived member, joined to their derived status. */
  memberViews: MemberView[];
  /**
   * EVERY member including archived ones. Money totals must use this: archiving
   * a member who owes ₹5,000 silently removed that debt from the gym's
   * money-owed figure, which is a way to lose real money.
   */
  allMemberViews: MemberView[];
  /** Same derivation keyed by member id, including archived members. */
  viewFor: (memberId: string) => MemberView | null;

  reload: () => Promise<void>;
  /** Online records: pull what the server changed now (a reward the server gave, 0025), then redraw. */
  refreshNow: () => Promise<void>;
  createMember: (draft: MemberDraft) => Promise<Member>;
  /** Import: many members in one save (see CrmData.createMembers). */
  createMembers: (drafts: readonly MemberDraft[]) => Promise<Member[]>;
  /** Data migration: imported memberships and receipts (see CrmData.importTerms). */
  importTerms: (items: readonly ImportTermItem[], importId: string) => Promise<ImportTermsResult>;
  undoImport: (importId: string) => Promise<UndoImportResult>;
  updateMember: (id: string, patch: Partial<MemberDraft>) => Promise<Member>;
  setMemberArchived: (id: string, archived: boolean) => Promise<void>;
  createPlan: (draft: PlanDraft) => Promise<void>;
  updatePlan: (id: string, patch: Partial<PlanDraft>) => Promise<void>;
  sellMembership: (input: SellMembershipInput) => Promise<SellMembershipResult>;
  cancelMembership: (id: string, reason: string | null) => Promise<void>;
  uncancelMembership: (id: string) => Promise<void>;
  /** Returns the written receipt, so the caller can offer to print it. */
  recordPayment: (input: RecordPaymentInput) => Promise<Payment>;
  voidPayment: (id: string, reason: string) => Promise<void>;
  /** `day` defaults to today; pass it to catch up a register the desk missed. */
  checkIn: (memberId: string, source: Visit['source'], day?: DateISO) => Promise<void>;
  undoCheckIn: (memberId: string, day: DateISO) => Promise<void>;
  updateGym: (patch: Partial<Omit<GymRecord, 'gymId' | 'createdAt'>>) => Promise<void>;

  // Step 5 (15 Oct 2026): enquiries, expenses, freeze / extra days.
  createEnquiry: (draft: EnquiryDraft) => Promise<Enquiry>;
  updateEnquiry: (id: string, patch: Partial<EnquiryDraft & Pick<Enquiry, 'status' | 'memberId'>>) => Promise<void>;
  addExpense: (draft: ExpenseDraft) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  extendMembership: (id: string, days: number, reason: string) => Promise<void>;
  /** PT: one session used today (or on `day`). Owner and Staff. */
  markPtSession: (membershipId: string, day?: DateISO) => Promise<void>;
  /** PT: take back the session marked on `day`. */
  undoPtSession: (membershipId: string, day: DateISO) => Promise<void>;
  /** Workout plans (18 Oct 2026): make or change one (owner and Staff / trainers alike). */
  saveWorkoutPlan: (draft: WorkoutPlanDraft) => Promise<WorkoutPlan>;
  withdrawWorkoutPlan: (id: string) => Promise<void>;

  /** Destructive resets, used by the welcome screen and settings. */
  loadDemoGym: () => Promise<void>;
  startEmptyGym: (gymName: string) => Promise<void>;

  /**
   * Offline front desk, step 3: this desk's waiting list (null for a gym kept only in this browser).
   * The screens mark waiting records and the banner shows the rest (ui/offline.tsx).
   */
  desk: DeskState | null;
  /** A money sheet opened: this device gets its offline receipt series if it has none (never throws). */
  prepareOffline: () => void;
  /**
   * The waiting list's actions (banner, Settings): try again, a refused receipt saved as cancelled or
   * removed (owner), sent with today's date (owner, a clock that was ahead), the device emptied (owner).
   * Each one re-reads the screens; an error is thrown for the caller to show.
   */
  deskAction: (kind: 'cancelled' | 'remove' | 'today' | 'clear', id?: string) => Promise<void>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm must be used inside <CrmProvider>');
  return ctx;
}

/**
 * Where the records live: this browser (`LocalCrmData`, which can also be replaced wholesale for
 * the demo) or online (`CloudCrmData`, which can be refreshed with other devices' changes).
 */
export type CrmBackend = CrmData & {
  replaceAll?: (snapshot: CrmSnapshot) => void;
  refresh?: () => Promise<boolean>;
  /** R-55 (offline front desk, step 1): set while the server cannot be reached. */
  offlineState?: () => OfflineState | null;
  /** Step 3: the waiting list, "Try sending again", and the notes' "OK". */
  deskState?: () => DeskState;
  sendAgain?: () => Promise<boolean>;
  dismissNote?: (id: string) => Promise<void>;
  /** Review fixes (24 Oct 2026): the series claimed when a money sheet opens; the owner's actions. */
  prepareOfflinePayments?: () => Promise<void>;
  saveHeldAsCancelled?: (id: string) => Promise<void>;
  removeHeld?: (id: string) => Promise<void>;
  sendWithToday?: (id: string) => Promise<boolean>;
  clearDevice?: () => Promise<void>;
};

/** How long "All sent" stays on the bar after the last waiting thing went. */
const ALL_SENT_MS = 8_000;

/** How often an online gym looks for changes made on other phones and computers. */
const REFRESH_MS = 15_000;

export function CrmProvider({ data, children }: { data?: CrmBackend; children: ReactNode }) {
  const db = useMemo<CrmBackend>(
    () => data ?? new LocalCrmData({ seed: () => emptySnapshot(Date.now()) }),
    [data],
  );

  // A front desk leaves this tab open for days. Freezing `today` at mount meant
  // that after midnight every check-in, receipt date and membership start date
  // was stamped with yesterday.
  const [today, setToday] = useState<DateISO>(() => todayISO());
  useEffect(() => {
    const sync = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    // Backstop for a tab that is visible and untouched across midnight.
    const timer = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  const [snapshot, setSnapshot] = useState<CrmSnapshot | null>(null);
  // R-55 / step 3: the offline bar and the waiting list (an online gym only).
  const [desk, setDesk] = useState<DeskState | null>(null);
  const syncOffline = useCallback(() => setDesk(db.deskState?.() ?? null), [db]);
  // "All sent": the moment the last waiting thing reached the server (while online).
  const [allSent, setAllSent] = useState(false);
  const lastWaiting = useRef(0);
  const allSentTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(allSentTimer.current), []);
  useEffect(() => {
    const now = desk?.waiting ?? 0;
    const was = lastWaiting.current;
    lastWaiting.current = now;
    if (was > 0 && now === 0 && desk && !desk.offline) {
      setAllSent(true);
      window.clearTimeout(allSentTimer.current);
      allSentTimer.current = window.setTimeout(() => setAllSent(false), ALL_SENT_MS);
    } else if (now > 0) {
      setAllSent(false);
    }
  }, [desk]);
  const offlineInfo = useMemo<OfflineInfo>(
    () => ({
      offline: desk?.offline ?? false,
      waitingIds: new Set(desk?.waitingIds ?? []),
      // Not yet sent and not refused (a refused one waits for the owner, filed under this gym).
      waiting: desk ? desk.waiting - desk.held.length : 0,
      canPayOffline: desk?.canPayOffline ?? false,
    }),
    [desk],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // UAT U-A13: the gym saved in this browser can't be read (its own screen, below).
  const [damaged, setDamaged] = useState<DamagedDataError | null>(null);

  // A money sheet opened: the offline receipt series, once (stable, so a sheet's effect runs once).
  const prepareOffline = useCallback(() => {
    void (db.prepareOfflinePayments?.() ?? Promise.resolve())
      .catch((e: unknown) => console.warn('[offline desk] receipt series', e))
      .finally(syncOffline);
  }, [db, syncOffline]);

  const reload = useCallback(async () => {
    try {
      setSnapshot(await db.load());
      setError(null);
      setDamaged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your gym.');
      setDamaged(e instanceof DamagedDataError ? e : null);
    } finally {
      setLoading(false);
      syncOffline();
    }
  }, [db, syncOffline]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshNow = useCallback(async () => {
    try {
      if (db.refresh) await db.refresh();
    } catch (e) {
      console.warn('[ForgeErr] refresh now', e);
    }
    await reload();
  }, [db, reload]);

  // Online records: pick up what other devices saved — every few seconds while this tab is in
  // front, and at once when it comes back. Only a real change redraws the screens.
  useEffect(() => {
    const refresh = db.refresh?.bind(db);
    if (!refresh) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        if (await refresh()) setSnapshot(await db.load());
      } catch {
        // quiet: offline for a moment; the next tick tries again, the bar says so, a save says why.
      } finally {
        busy = false;
        syncOffline();
      }
    };
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    const onShow = () => void tick();
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onShow);
    // R-55: the internet is back: look at once (not up to 15 s later).
    window.addEventListener('online', onShow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('online', onShow);
    };
  }, [db, syncOffline]);

  /**
   * Run a write, then re-read. Errors are re-thrown so the calling form can show
   * them next to the field that caused them rather than as a page-level failure.
   */
  const mutate = useCallback(
    async <T,>(op: (adapter: CrmData) => Promise<T>): Promise<T> => {
      let result: T;
      try {
        result = await op(db);
      } catch (e) {
        // Online records: a failed action can still have brought news (a late save, another
        // desk's change). Show the truth before the form shows why it failed.
        if (db.refresh) await db.load().then(setSnapshot, () => undefined);
        syncOffline();
        throw e;
      }
      setSnapshot(await db.load());
      syncOffline();
      return result;
    },
    [db, syncOffline],
  );

  // ---------------------------------------------------------------- derived

  const byMember = useMemo(() => {
    const memberships = new Map<string, CrmSnapshot['memberships']>();
    const visits = new Map<string, CrmSnapshot['visits']>();
    const payments = new Map<string, CrmSnapshot['payments']>();
    if (!snapshot) return { memberships, visits, payments };

    for (const m of snapshot.memberships) {
      const list = memberships.get(m.memberId) ?? [];
      list.push(m);
      memberships.set(m.memberId, list);
    }
    for (const v of snapshot.visits) {
      const list = visits.get(v.memberId) ?? [];
      list.push(v);
      visits.set(v.memberId, list);
    }
    for (const p of snapshot.payments) {
      const list = payments.get(p.memberId) ?? [];
      list.push(p);
      payments.set(p.memberId, list);
    }
    return { memberships, visits, payments };
  }, [snapshot]);

  const viewOf = useCallback(
    (member: Member): MemberView =>
      buildMemberView(
        member,
        byMember.memberships.get(member.id) ?? [],
        byMember.payments.get(member.id) ?? [],
        byMember.visits.get(member.id) ?? [],
        today,
      ),
    [byMember, today],
  );

  const allMemberViews = useMemo(
    () => (snapshot ? snapshot.members.map(viewOf) : []),
    [snapshot, viewOf],
  );

  const memberViews = useMemo(
    () => allMemberViews.filter((v) => !v.member.archived),
    [allMemberViews],
  );

  const viewFor = useCallback(
    (memberId: string): MemberView | null => {
      const member = snapshot?.members.find((m) => m.id === memberId);
      return member ? viewOf(member) : null;
    },
    [snapshot, viewOf],
  );

  // ---------------------------------------------------------------- actions

  const value = useMemo<CrmContextValue | null>(() => {
    if (!snapshot) return null;
    return {
      snapshot,
      today,
      loading,
      error,
      memberViews,
      allMemberViews,
      viewFor,
      reload,
      refreshNow,
      createMember: (draft) => mutate((a) => a.createMember(draft)),
      createMembers: (drafts) => mutate((a) => a.createMembers(drafts)),
      importTerms: (items, importId) => mutate((a) => a.importTerms(items, importId)),
      undoImport: (importId) => mutate((a) => a.undoImport(importId)),
      updateMember: (id, patch) => mutate((a) => a.updateMember(id, patch)),
      setMemberArchived: async (id, archived) => void (await mutate((a) => a.setMemberArchived(id, archived))),
      createPlan: async (draft) => void (await mutate((a) => a.createPlan(draft))),
      updatePlan: async (id, patch) => void (await mutate((a) => a.updatePlan(id, patch))),
      sellMembership: (input) => mutate((a) => a.sellMembership(input)),
      cancelMembership: async (id, reason) => void (await mutate((a) => a.cancelMembership(id, reason))),
      uncancelMembership: async (id) => void (await mutate((a) => a.uncancelMembership(id))),
      recordPayment: (input) => mutate((a) => a.recordPayment(input)),
      voidPayment: async (id, reason) => void (await mutate((a) => a.voidPayment(id, reason))),
      checkIn: async (memberId, source, day) =>
        void (await mutate((a) => a.checkIn(memberId, day ?? today, source, today))),
      undoCheckIn: async (memberId, day) => void (await mutate((a) => a.undoCheckIn(memberId, day))),
      updateGym: async (patch) => void (await mutate((a) => a.updateGym(patch))),
      createEnquiry: (draft) => mutate((a) => a.createEnquiry(draft)),
      updateEnquiry: async (id, patch) => void (await mutate((a) => a.updateEnquiry(id, patch))),
      addExpense: async (draft) => void (await mutate((a) => a.addExpense(draft))),
      removeExpense: async (id) => void (await mutate((a) => a.removeExpense(id))),
      extendMembership: async (id, days, reason) => void (await mutate((a) => a.extendMembership(id, days, reason))),
      markPtSession: async (membershipId, day) =>
        void (await mutate((a) => a.markPtSession(membershipId, day ?? today, today))),
      undoPtSession: async (membershipId, day) => void (await mutate((a) => a.undoPtSession(membershipId, day))),
      saveWorkoutPlan: (draft) => mutate((a) => a.saveWorkoutPlan(draft)),
      withdrawWorkoutPlan: async (id) => void (await mutate((a) => a.withdrawWorkoutPlan(id))),
      // Browser records only: an online gym is never wiped or filled with sample members.
      loadDemoGym: async () => {
        if (!db.replaceAll) throw new Error('An online gym can’t be replaced with the demo gym.');
        db.replaceAll(demoSnapshot(today));
        await reload();
      },
      startEmptyGym: async (gymName) => {
        if (!db.replaceAll) throw new Error('An online gym can’t be erased from here.');
        db.replaceAll(emptySnapshot(Date.now(), gymName));
        await reload();
      },
      desk,
      prepareOffline,
      deskAction: async (kind, id) => {
        try {
          if (kind === 'cancelled' && id) await db.saveHeldAsCancelled?.(id);
          else if (kind === 'remove' && id) await db.removeHeld?.(id);
          else if (kind === 'today' && id) await db.sendWithToday?.(id);
          else if (kind === 'clear') await db.clearDevice?.();
        } finally {
          syncOffline();
          await reload();
        }
      },
    };
  }, [snapshot, today, loading, error, memberViews, allMemberViews, viewFor, reload, refreshNow, mutate, db, desk, syncOffline, prepareOffline]);

  const sendAgain = useCallback(async () => {
    try {
      if (db.sendAgain && (await db.sendAgain())) setSnapshot(await db.load());
    } catch (e) {
      console.warn('[offline desk] try sending again', e);
    } finally {
      syncOffline();
    }
  }, [db, syncOffline]);
  const dismissNote = useCallback(
    (id: string) => {
      void (db.dismissNote?.(id) ?? Promise.resolve())
        .catch((e: unknown) => console.warn('[offline desk] note not hidden', e))
        .finally(syncOffline);
    },
    [db, syncOffline],
  );

  if (!value) {
    if (!loading && damaged) {
      return (
        <DamagedData
          error={damaged}
          onRetry={() => void reload()}
          onStartNew={
            // Only with the copy safely kept: starting new writes over the damaged original.
            damaged.keptAs && db.replaceAll
              ? async () => {
                  db.replaceAll?.(emptySnapshot(Date.now()));
                  await reload();
                }
              : undefined
          }
        />
      );
    }
    return <>{loading ? <Booting /> : <BootFailed message={error} onRetry={() => void reload()} />}</>;
  }

  return (
    <CrmContext.Provider value={value}>
      <OfflineContext.Provider value={offlineInfo}>
        {desk && (
          <DeskBar
            state={desk}
            allSent={allSent}
            names={(id) => value.snapshot.members.find((m) => m.id === id)?.fullName ?? 'A member'}
            onSendAgain={() => void sendAgain()}
            onDismiss={dismissNote}
            onAction={value.deskAction}
          />
        )}
        {children}
      </OfflineContext.Provider>
    </CrmContext.Provider>
  );
}

function Booting() {
  return (
    <div style={centered}>
      <span>Loading your gym…</span>
    </div>
  );
}

function BootFailed({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div style={centered}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <strong style={{ color: color.criticalText }}>Couldn’t open your gym</strong>
        <span>{message ?? 'Something went wrong while opening your gym.'}</span>
        <button type="button" onClick={onRetry} style={retryButton}>
          Try again
        </button>
      </div>
    </div>
  );
}

/** The kept copy as a file, exactly as it was saved (it may be cut off; it is never "fixed"). */
export function downloadSavedData(raw: string, today: DateISO = todayISO()): void {
  downloadTextFile(`forgeai-saved-gym-${today}.txt`, raw, 'text/plain;charset=utf-8');
}

/**
 * UAT U-A13 (17 Oct 2026, owner's decision): the gym saved in this browser can't be read. Say so,
 * keep it, and offer three ways on: Try again, Download the saved data, Start a new gym (asks first,
 * and says the old data can still be downloaded from Settings). Nothing is ever deleted here.
 */
function DamagedData({
  error,
  onRetry,
  onStartNew,
}: {
  error: DamagedDataError;
  onRetry: () => void;
  onStartNew?: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const startNew = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onStartNew?.();
    } catch (e) {
      console.warn('[ForgeErr] start a new gym over unreadable data:', e);
      setFailed(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={centered}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center', maxWidth: 420 }}>
        <strong role="alert" style={{ color: color.criticalText, fontSize: 17 }}>
          We couldn’t read the gym saved in this browser. Your data is kept.
        </strong>
        {failed && <span role="alert">{failed}</span>}
        {!asking ? (
          <>
            <button type="button" onClick={onRetry} style={retryButton}>
              Try again
            </button>
            <button type="button" onClick={() => downloadSavedData(error.raw)} style={retryButton}>
              Download the saved data
            </button>
            {onStartNew && (
              <button type="button" onClick={() => setAsking(true)} style={retryButton}>
                Start a new gym
              </button>
            )}
          </>
        ) : (
          <div role="group" aria-label="Start a new gym?" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <span>
              Start a new, empty gym in this browser? The data that couldn’t be read stays here. You can still download it from Settings → Your data.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startNew()}
              style={retryButton}
            >
              Yes, start a new gym
            </button>
            <button type="button" onClick={() => setAsking(false)} style={retryButton}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const centered: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  color: color.inkSecondary,
  fontFamily: "'Manrope', system-ui, sans-serif",
  padding: 20,
  textAlign: 'center',
};

const retryButton: React.CSSProperties = {
  appearance: 'none',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 999,
  border: `1px solid ${color.borderStrong}`,
  background: 'transparent',
  color: color.ink,
  fontFamily: "'Manrope', system-ui, sans-serif",
  fontWeight: 700,
  cursor: 'pointer',
};
