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
} from './data/adapter';
import { demoSnapshot } from './data/demo';
import { emptySnapshot, LocalCrmData } from './data/local';
import { todayISO, type DateISO } from './logic/dates';
import { buildMemberView } from './logic/membership';
import type { Member, MemberDraft, MemberView, Payment, PlanDraft, Visit } from './types';

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
  createMember: (draft: MemberDraft) => Promise<Member>;
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

  /** Destructive resets, used by the welcome screen and settings. */
  loadDemoGym: () => Promise<void>;
  startEmptyGym: (gymName: string) => Promise<void>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm must be used inside <CrmProvider>');
  return ctx;
}

export function CrmProvider({ data, children }: { data?: LocalCrmData; children: ReactNode }) {
  const db = useMemo(() => data ?? new LocalCrmData({ seed: () => emptySnapshot(Date.now()) }), [data]);

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSnapshot(await db.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your gym.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Run a write, then re-read. Errors are re-thrown so the calling form can show
   * them next to the field that caused them rather than as a page-level failure.
   */
  const mutate = useCallback(
    async <T,>(op: (adapter: CrmData) => Promise<T>): Promise<T> => {
      const result = await op(db);
      setSnapshot(await db.load());
      return result;
    },
    [db],
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
      createMember: (draft) => mutate((a) => a.createMember(draft)),
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
      loadDemoGym: async () => {
        db.replaceAll(demoSnapshot(today));
        await reload();
      },
      startEmptyGym: async (gymName) => {
        db.replaceAll(emptySnapshot(Date.now(), gymName));
        await reload();
      },
    };
  }, [snapshot, today, loading, error, memberViews, allMemberViews, viewFor, reload, mutate, db]);

  if (!value) {
    return <>{loading ? <Booting /> : <BootFailed message={error} onRetry={reload} />}</>;
  }

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
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
        <strong style={{ color: '#F0716F' }}>Couldn’t open your gym</strong>
        <span>{message ?? 'Something went wrong reading your saved data.'}</span>
        <button type="button" onClick={onRetry} style={retryButton}>
          Try again
        </button>
      </div>
    </div>
  );
}

const centered: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  color: '#A9AFBD',
  fontFamily: "'Manrope', system-ui, sans-serif",
  padding: 20,
  textAlign: 'center',
};

const retryButton: React.CSSProperties = {
  appearance: 'none',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'transparent',
  color: '#F4F5F7',
  fontFamily: "'Manrope', system-ui, sans-serif",
  fontWeight: 700,
  cursor: 'pointer',
};
