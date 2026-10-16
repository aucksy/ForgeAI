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
  ImportTermItem,
  ImportTermsResult,
  UndoImportResult,
} from './data/adapter';
import { demoSnapshot } from './data/demo';
import { emptySnapshot, LocalCrmData } from './data/local';
import { todayISO, type DateISO } from './logic/dates';
import { buildMemberView } from './logic/membership';
import { tr } from './i18n';
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

/**
 * Where the records live: this browser (`LocalCrmData`, which can also be replaced wholesale for
 * the demo) or online (`CloudCrmData`, which can be refreshed with other devices' changes).
 */
export type CrmBackend = CrmData & {
  replaceAll?: (snapshot: CrmSnapshot) => void;
  refresh?: () => Promise<boolean>;
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSnapshot(await db.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not load your gym.', 'Aapka gym load nahi hua.'));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
        // Offline for a moment: the next tick tries again; a save shows its own error.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    const onShow = () => void tick();
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [db]);

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
        throw e;
      }
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
      // Browser records only: an online gym is never wiped or filled with sample members.
      loadDemoGym: async () => {
        if (!db.replaceAll) throw new Error(tr('An online gym can’t be replaced with the demo gym.', 'Online gym ki jagah demo gym nahi aa sakta.'));
        db.replaceAll(demoSnapshot(today));
        await reload();
      },
      startEmptyGym: async (gymName) => {
        if (!db.replaceAll) throw new Error(tr('An online gym can’t be erased from here.', 'Online gym yahan se mitaya nahi ja sakta.'));
        db.replaceAll(emptySnapshot(Date.now(), gymName));
        await reload();
      },
    };
  }, [snapshot, today, loading, error, memberViews, allMemberViews, viewFor, reload, mutate, db]);

  if (!value) {
    return <>{loading ? <Booting /> : <BootFailed message={error} onRetry={() => void reload()} />}</>;
  }

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

function Booting() {
  return (
    <div style={centered}>
      <span>{tr('Loading your gym…', 'Aapka gym load ho raha hai…')}</span>
    </div>
  );
}

function BootFailed({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div style={centered}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <strong style={{ color: '#F0716F' }}>{tr('Couldn’t open your gym', 'Aapka gym nahi khula')}</strong>
        <span>{message ?? tr('Something went wrong reading your saved data.', 'Saved data padhne mein kuch gadbad hui.')}</span>
        <button type="button" onClick={onRetry} style={retryButton}>
          {tr('Try again', 'Phir se try karo')}
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
