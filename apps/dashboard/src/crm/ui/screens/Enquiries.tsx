/**
 * Enquiries (Gym Panel step 5, 15 Oct 2026) — people who asked about joining and have not joined
 * yet. GoGym4U and GymBook both have this; owners open it every morning to see who to call.
 *
 * The default chip is "who to call today" (overdue + due today, the longest overdue first). Each
 * row is one person with the four things an owner does next: call, WhatsApp, make them a member,
 * or move the call to another day — and "Nahi aayenge" to close it, with an undo.
 * The bucket and message rules live in logic/enquiries.ts (pure, tested).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { useCan } from '../../auth/AuthProvider';
import { useCrm } from '../../store';
import { formatDay, relativeDay } from '../../logic/dates';
import {
  asLostReason,
  asSource,
  emptyEnquiryForm,
  ENQUIRY_SOURCES,
  enquiryBucket,
  joinedBySource,
  LOST_REASONS,
  lostReasonLabel,
  sourceLabel,
  sourceRowWords,
  ENQUIRY_FILTERS,
  filterCounts,
  filterEnquiries,
  findOpenDuplicate,
  followUpMessage,
  followUpPicks,
  validateEnquiry,
  type EnquiryField,
  type EnquiryFilter,
  type EnquiryFormDraft,
} from '../../logic/enquiries';
import { alreadyRewarded, friendReward, referralOf, type FriendReward } from '../../logic/referrals';
import { memberPrefill, selfJoinOf, sellPlanFor, sellStartFor } from '../../logic/selfJoin';
import { formatINR } from '../../logic/money';
import type { CrmSnapshot } from '../../data/adapter';
import { DIAL_CODES, findDuplicatePhone, formatPhone, normalizePhone, phoneDigits } from '../../logic/members';
import { whatsAppHref } from '../../shop/invite';
import type { Enquiry, Member } from '../../types';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import { SellMembershipSheet } from '../forms/SellMembershipSheet';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  Row,
  SectionTitle,
  SelectField,
  Sheet,
  TextField,
  UndoBar,
  TOUCH,
  color,
  font,
  radius,
  space,
} from '../kit';
import { navigate } from '../router';
import { newRequestId } from '../../data/local';

function filterLabel(f: EnquiryFilter): string {
  switch (f) {
    case 'due':
      return 'Follow up today';
    case 'later':
      return 'Later';
    case 'joined':
      return 'Joined';
    case 'lost':
      return 'Not interested';
    case 'all':
      return 'All';
  }
}

export function EnquiriesScreen({ startAdding }: { startAdding?: boolean } = {}) {
  const { snapshot, today, updateEnquiry, extendMembership } = useCrm();
  const enquiries = snapshot.enquiries ?? [];
  // F147: adding free days to a plan is the owner's (the same right as "Freeze / extra days").
  const canReward = useCan()('freeze');
  // memberId set = opened straight after "Add as member": closing it opens that new member's page.
  const [thanking, setThanking] = useState<{ enquiryId: string; memberId: string | null } | null>(null);
  const [filter, setFilter] = useState<EnquiryFilter>('due');
  const [adding, setAdding] = useState(Boolean(startAdding));
  const [rescheduling, setRescheduling] = useState<Enquiry | null>(null);
  const [converting, setConverting] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Enquiry | null>(null);

  const counts = useMemo(() => filterCounts(enquiries, today), [enquiries, today]);
  // Launch audit 3 Nov 2026: which source brings people who join (only enquiries with a source).
  const sources = useMemo(() => joinedBySource(enquiries), [enquiries]);
  const rows = useMemo(() => filterEnquiries(enquiries, filter, today), [enquiries, filter, today]);

  // The undo bar goes away on its own; the "Nahi aayenge" chip keeps a permanent way back.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const run = useCallback(async (op: () => Promise<void>) => {
    setError(null);
    try {
      await op();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    }
  }, []);

  const markLost = (e: Enquiry) =>
    run(async () => {
      await updateEnquiry(e.id, { status: 'lost' });
      setUndo(e);
    });

  const reopen = (e: Enquiry) =>
    run(async () => {
      await updateEnquiry(e.id, { status: 'open', lostReason: null });
      setUndo(null);
    });

  const setLostReason = (e: Enquiry, value: string) =>
    run(async () => {
      await updateEnquiry(e.id, { lostReason: asLostReason(value) });
    });

  /**
   * F147: the owner's one tap. The days go on the member's plan as ordinary "extra days" (the note names
   * the friend), then the enquiry remembers it so the offer never shows again. A second tap after a lost
   * save finds the note already on the plan and only marks the enquiry.
   */
  const giveReward = (e: Enquiry) => giveFriendReward(e, snapshot, today, extendMembership, updateEnquiry);

  /** After "Add as member": a referred friend opens the thank-you first, when there is one to give. */
  const joined = (e: Enquiry, member: Member) => {
    const ref = referralOf(e);
    const ready = friendReward({ ...e, status: 'joined', memberId: member.id }, snapshot, today).kind === 'ready';
    if (ref && ready && canReward) setThanking({ enquiryId: e.id, memberId: member.id });
    else navigate(`/members/${member.id}`);
  };

  const thankingEnquiry = thanking ? enquiries.find((x) => x.id === thanking.enquiryId) ?? null : null;

  const addButton = <Button needsInternet onClick={() => setAdding(true)}>+ Add enquiry</Button>;

  return (
    <>
      <PageHeader
        title="Enquiries"
        subtitle="People who asked about joining"
        actions={addButton}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          label="Show enquiries"
          value={filter}
          onChange={(v) => setFilter(v as EnquiryFilter)}
          options={ENQUIRY_FILTERS.map((f) => ({ value: f, label: filterLabel(f), count: counts[f] }))}
        />
      </div>

      {sources.length > 0 && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Where enquiries came from</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontFamily: font.body, fontSize: 14, color: color.ink }}>
            {sources.map((r) => (
              <li key={r.source}>{sourceRowWords(r)}</li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyEnquiries filter={filter} total={enquiries.length} action={addButton} />
        </Card>
      ) : (
        <Card pad={0}>
          {rows.map((e, i) => (
            <EnquiryRow
              key={e.id}
              enquiry={e}
              first={i === 0}
              today={today}
              gymName={snapshot.gym.name}
              onConvert={() => setConverting(e)}
              onReschedule={() => setRescheduling(e)}
              onLost={() => void markLost(e)}
              onReopen={() => void reopen(e)}
              onLostReason={(v) => void setLostReason(e, v)}
              reward={friendReward(e, snapshot, today)}
              canReward={canReward}
              onReward={() => setThanking({ enquiryId: e.id, memberId: null })}
            />
          ))}
        </Card>
      )}

      {undo && (
        <UndoBar
          message={`${undo.name}: marked not interested.`}
          onUndo={() => void reopen(undo)}
        />
      )}

      {adding && <AddEnquirySheet onClose={() => setAdding(false)} />}
      {rescheduling && <FollowUpSheet enquiry={rescheduling} onClose={() => setRescheduling(null)} />}
      {converting && (
        <ConvertFlow
          enquiry={converting}
          members={snapshot.members}
          onClose={() => setConverting(null)}
          onError={setError}
          onJoined={(member) => joined(converting, member)}
        />
      )}
      {thanking && thankingEnquiry && (
        <ThankSheet
          reward={friendReward(thankingEnquiry, snapshot, today)}
          friendName={thankingEnquiry.name}
          afterJoin={thanking.memberId !== null}
          onGive={() => giveReward(thankingEnquiry)}
          onClose={() => {
            const next = thanking.memberId;
            setThanking(null);
            if (next) navigate(`/members/${next}`);
          }}
        />
      )}
    </>
  );
}

/** F147: the owner's one tap (see giveReward above). Shared with Today's "Joined online" (R-513). */
async function giveFriendReward(
  e: Enquiry,
  snapshot: CrmSnapshot,
  today: string,
  extendMembership: (membershipId: string, days: number, reason: string) => Promise<unknown>,
  updateEnquiry: (id: string, patch: { referral: NonNullable<Enquiry['referral']> }) => Promise<unknown>,
): Promise<void> {
  const r = friendReward(e, snapshot, today);
  const ref = referralOf(e);
  if (r.kind !== 'ready' || !ref) return;
  if (!alreadyRewarded(snapshot.memberships, r.member.id, e.name)) {
    await extendMembership(r.membership.id, r.days, r.reason);
  }
  await updateEnquiry(e.id, { referral: { ...ref, rewardGiven: { days: r.days, membershipId: r.membership.id, on: today } } });
}

/**
 * R-513: "Make member" on Today's "Joined online" card. The same steps as "Add as member" on this screen: the
 * filled-in Add member form, then Sell membership on the plan they picked (nothing collected: they pay at the
 * desk), the F147 thank-you when a member invited them, then the new member's page.
 */
export function MakeMemberFlow({ enquiry, onClose, onError }: { enquiry: Enquiry; onClose: () => void; onError: (message: string) => void }) {
  const { snapshot, today, updateEnquiry, extendMembership } = useCrm();
  const canReward = useCan()('freeze');
  const [thankFor, setThankFor] = useState<string | null>(null);
  const thanking = useRef(false);
  const fresh = (snapshot.enquiries ?? []).find((x) => x.id === enquiry.id) ?? enquiry;

  if (thankFor) {
    return (
      <ThankSheet
        reward={friendReward(fresh, snapshot, today)}
        friendName={fresh.name}
        afterJoin
        onGive={() => giveFriendReward(fresh, snapshot, today, extendMembership, updateEnquiry)}
        onClose={() => {
          onClose();
          navigate(`/members/${thankFor}`);
        }}
      />
    );
  }
  return (
    <ConvertFlow
      enquiry={enquiry}
      members={snapshot.members}
      onClose={() => {
        if (!thanking.current) onClose();
      }}
      onError={onError}
      onJoined={(member) => {
        const ready = friendReward({ ...enquiry, status: 'joined', memberId: member.id }, snapshot, today).kind === 'ready';
        if (referralOf(enquiry) && ready && canReward) {
          thanking.current = true;
          setThankFor(member.id);
        } else navigate(`/members/${member.id}`);
      }}
    />
  );
}

/** R-513: the row's line for a "Become a member" request. */
function selfJoinLine(e: Enquiry): string | null {
  const j = selfJoinOf(e);
  if (!j) return null;
  return `Asked to join online: ${j.planName}, from ${formatDay(j.startsOn)}, ${formatINR(j.totalP)}. ${j.paid ? 'Paid.' : 'Not paid yet.'}`;
}

function EmptyEnquiries({ filter, total, action }: { filter: EnquiryFilter; total: number; action: ReactNode }) {
  if (total === 0) {
    return (
      <EmptyState
        title="No enquiries yet"
        body="When someone walks in or calls to ask about joining, add them here with a day to call back."
        action={action}
      />
    );
  }
  const [title, body] =
    filter === 'due'
      ? ['Nobody to call today', 'Every follow-up is on a later day.']
      : filter === 'later'
        ? ['Nothing scheduled later', undefined]
        : filter === 'joined'
          ? ['Nobody has joined from an enquiry yet', undefined]
          : filter === 'lost'
            ? ['Nobody marked not interested', undefined]
            : ['No enquiries', undefined];
  return <EmptyState title={title} body={body} />;
}

// ---------------------------------------------------------------- one row

function EnquiryRow({
  enquiry: e,
  first,
  today,
  gymName,
  onConvert,
  onReschedule,
  onLost,
  onReopen,
  onLostReason,
  reward,
  canReward,
  onReward,
}: {
  enquiry: Enquiry;
  first: boolean;
  today: string;
  gymName: string;
  onConvert: () => void;
  onReschedule: () => void;
  onLost: () => void;
  onReopen: () => void;
  onLostReason: (value: string) => void;
  reward: FriendReward;
  canReward: boolean;
  onReward: () => void;
}) {
  const bucket = enquiryBucket(e, today);
  const referral = referralOf(e);
  const open = e.status === 'open';
  const followTone =
    bucket === 'overdue' ? color.criticalText : bucket === 'today' ? color.warning : color.inkSecondary;

  return (
    <div
      style={{
        padding: space.lg,
        borderTop: first ? 'none' : `1px solid ${color.border}`,
        display: 'grid',
        gap: space.md,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: space.md, alignItems: 'flex-start', justifyContent: 'space-between', minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink, overflowWrap: 'anywhere' }}>
            {e.name}
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
            {formatPhone(e.phone)}
          </div>
          {/* R-513: the server's "Joined online: ..." note is the older app's copy of the line below. */}
          {e.interest && !(selfJoinLine(e) && e.interest.startsWith('Joined online:')) && (
            <div style={{ fontFamily: font.body, fontSize: 13, color: color.ink, marginTop: 4, overflowWrap: 'anywhere' }}>
              {e.interest}
            </div>
          )}
          {selfJoinLine(e) && (
            <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.accentBright, marginTop: 4, overflowWrap: 'anywhere' }}>
              {selfJoinLine(e)}
            </div>
          )}
          {/* F147: a friend a member invited from the app. Only the member's name, never their number. */}
          {referral && (
            <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.accentBright, marginTop: 4, overflowWrap: 'anywhere' }}>
              {`Referred by ${referral.by}`}
            </div>
          )}
          {sourceLabel(e.source) && (
            <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 4 }}>
              {`Heard about us: ${sourceLabel(e.source)}`}
            </div>
          )}
          {open && (
            <div style={{ fontFamily: font.body, fontSize: 12, fontWeight: 600, color: followTone, marginTop: 4 }}>
              {e.followUpOn
                ? `Call back ${formatDay(e.followUpOn)} · ${relativeDay(e.followUpOn, today)}`
                : 'No call-back day set'}
            </div>
          )}
        </div>
        <StatusPill bucket={bucket} />
      </div>

      <div style={actionsGrid}>
        <a href={`tel:+${phoneDigits(e.phone)}`} style={linkButton} aria-label={`Call ${e.name}`}>
          Call
        </a>
        <a
          href={whatsAppHref(followUpMessage(e, { name: gymName }), e.phone)}
          target="_blank"
          rel="noreferrer"
          style={linkButton}
          aria-label={`WhatsApp ${e.name}`}
        >
          WhatsApp
        </a>
        {open && (
          <>
            <Button wrap needsInternet onClick={onConvert} ariaLabel={`Make ${e.name} a member`}>
              Add as member
            </Button>
            <Button wrap variant="ghost" needsInternet onClick={onReschedule} ariaLabel={`Change follow-up date for ${e.name}`}>
              Follow-up date
            </Button>
            {/* UAT 5 Nov 2026: an outlined button like its neighbours, not bare red words. */}
            <Button wrap variant="ghost" tone="danger" needsInternet onClick={onLost} ariaLabel={`${e.name} is not interested`}>
              Not interested
            </Button>
          </>
        )}
        {e.status === 'joined' && e.memberId && (
          <Button wrap variant="ghost" onClick={() => navigate(`/members/${e.memberId}`)}>
            Open member
          </Button>
        )}
        {e.status === 'lost' && (
          <Button wrap variant="ghost" needsInternet onClick={onReopen} ariaLabel={`Reopen ${e.name}`}>
            Reopen
          </Button>
        )}
        {reward.kind === 'ready' && canReward && (
          <Button wrap needsInternet onClick={onReward} ariaLabel={`Give ${reward.by} free days for bringing ${e.name}`}>
            {/* UAT 5 Nov 2026: the name made it 3 lines; "Referred by" above already names them. */}
            Give free days
          </Button>
        )}
      </div>

      {reward.kind !== 'none' && reward.kind !== 'ready' && (reward.kind === 'given' || canReward) && (
        <div style={{ marginTop: -space.sm, fontFamily: font.body, fontSize: 13, color: color.inkSecondary, overflowWrap: 'anywhere' }}>
          {rewardNote(reward)}
        </div>
      )}

      {/* Launch audit 3 Nov 2026: why they did not join (optional), so the owner sees a pattern. */}
      {e.status === 'lost' && (
        <div style={{ marginTop: -space.md }}>
          <SelectField
            label={`Why did ${e.name} not join? (optional)`}
            value={e.lostReason ?? ''}
            onChange={onLostReason}
            options={[{ value: '', label: lostReasonLabel(e.lostReason) ? 'Clear the reason' : 'Not known' }, ...LOST_REASONS]}
          />
        </div>
      )}
    </div>
  );
}

/** F147: why the thank-you is not offered on a joined friend's row (or that it was given). */
function rewardNote(r: Exclude<FriendReward, { kind: 'none' } | { kind: 'ready' }>): string {
  const days = `${r.days} free ${r.days === 1 ? 'day' : 'days'}`;
  switch (r.kind) {
    case 'given':
      return `${r.by} got ${days} for this friend.`;
    case 'no_member':
      return `${r.by} is not on your member list, so the ${days} cannot be added here.`;
    case 'no_plan':
      return `${r.by} has no plan running, so there is nothing to add the ${days} to. Add them by hand when ${r.by} renews.`;
  }
}

function StatusPill({ bucket }: { bucket: ReturnType<typeof enquiryBucket> }) {
  switch (bucket) {
    case 'overdue':
      return <Pill tone="critical">Overdue</Pill>;
    case 'today':
      return <Pill tone="warn">Today</Pill>;
    case 'joined':
      return <Pill tone="good">Joined</Pill>;
    case 'lost':
      return <Pill tone="muted">Not interested</Pill>;
    default:
      return null;
  }
}

/**
 * Two buttons a row on a 375px phone, more on a wider screen, one a row on a very narrow one;
 * every one at least 44px tall. A label too long for its half wraps onto a second line inside its
 * button instead of spilling out of it.
 */
const actionsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))',
  gap: space.sm,
};

const linkButton: CSSProperties = {
  minHeight: TOUCH,
  padding: '10px 14px',
  borderRadius: radius.pill,
  border: `1px solid ${color.borderStrong}`,
  color: color.accentBright,
  fontFamily: font.body,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  lineHeight: 1.25,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

// ---------------------------------------------------------------- add

function AddEnquirySheet({ onClose }: { onClose: () => void }) {
  const { snapshot, today, createEnquiry } = useCrm();
  const [form, setForm] = useState<EnquiryFormDraft>(() => emptyEnquiryForm(today));
  const [fieldError, setFieldError] = useState<{ field: EnquiryField; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // C7-1: one id for this sheet's save, so a second press after "no internet" saves once.
  const [requestId] = useState(newRequestId);
  // Launch audit 3 Nov 2026: where they heard about the gym (optional).
  const [source, setSource] = useState('');

  const set = (key: EnquiryField) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldError(null);
    setFormError(null);
  };
  const errorFor = (field: EnquiryField) => (fieldError?.field === field ? fieldError.message : null);

  // Warn, don't block: the same person can ask twice, or share a family number.
  const typed = normalizePhone(form.dialCode, form.phone);
  const dupe = typed ? findOpenDuplicate(snapshot.enquiries ?? [], typed.e164) : null;
  const member = typed ? findDuplicatePhone(snapshot.members, typed.e164) : null;

  const dialOptions = [...new Set<string>([...DIAL_CODES, form.dialCode])].map((c) => ({ value: c, label: c }));

  const save = async () => {
    const result = validateEnquiry(form, today);
    if (!result.ok) {
      setFieldError({ field: result.field, message: result.message });
      return;
    }
    setSaving(true);
    try {
      await createEnquiry({ ...result.value, requestId, source: asSource(source) });
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save this enquiry.');
    } finally {
      setSaving(false);
    }
  };

  const phoneNote = member
    ? `${member.fullName} is already a member with this number.`
    : dupe
      ? `${dupe.name} already asked from this number${dupe.followUpOn ? ` (call back ${formatDay(dupe.followUpOn)})` : ''}. You can still save.`
      : undefined;

  return (
    <Sheet
      title="Add enquiry"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save enquiry'}
          </Button>
        </>
      }
    >
      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      <TextField
        label="Name"
        value={form.name}
        onChange={set('name')}
        error={errorFor('name')}
        autoFocus
        placeholder="Rohit Meena"
      />

      <Row gap={space.sm} align="flex-start">
        <div style={{ width: 110 }}>
          <SelectField label="Code" value={form.dialCode} onChange={set('dialCode')} options={dialOptions} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label="Mobile number"
            value={form.phone}
            onChange={set('phone')}
            error={errorFor('phone')}
            inputMode="tel"
            placeholder="98765 43210"
          />
        </div>
      </Row>
      {phoneNote && !errorFor('phone') && (
        <div role="status" style={{ fontFamily: font.body, fontSize: 12, fontWeight: 600, color: color.warning, marginTop: 5 }}>
          {phoneNote}
        </div>
      )}

      <TextField
        label="Interested in (optional)"
        value={form.interest}
        onChange={set('interest')}
        error={errorFor('interest')}
        placeholder="3 months, evening batch"
      />

      <SelectField
        label="Where did they hear about us? (optional)"
        value={source}
        onChange={setSource}
        options={[{ value: '', label: 'Not asked' }, ...ENQUIRY_SOURCES]}
      />

      <TextField
        label="Follow-up date"
        value={form.followUpOn}
        onChange={set('followUpOn')}
        type="date"
        error={errorFor('followUpOn')}
        hint={form.followUpOn ? `Call back on ${formatDay(form.followUpOn)} (${relativeDay(form.followUpOn, today)})` : 'No date: it goes under Later.'}
      />
      <QuickPicks today={today} value={form.followUpOn} onPick={set('followUpOn')} />
    </Sheet>
  );
}

function QuickPicks({ today, value, onPick }: { today: string; value: string; onPick: (d: string) => void }) {
  return (
    <div style={{ ...actionsGrid, marginTop: space.sm }}>
      {followUpPicks(today).map((p) => (
        <Button key={p.date} variant={value === p.date ? 'primary' : 'ghost'} onClick={() => onPick(p.date)}>
          {p.label}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- follow-up date

function FollowUpSheet({ enquiry, onClose }: { enquiry: Enquiry; onClose: () => void }) {
  const { today, updateEnquiry } = useCrm();
  const [custom, setCustom] = useState(enquiry.followUpOn && enquiry.followUpOn >= today ? enquiry.followUpOn : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (date: string) => {
    if (!date) {
      setError('Pick a date.');
      return;
    }
    if (date < today) {
      setError('The follow-up date can’t be in the past.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateEnquiry(enquiry.id, { followUpOn: date });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={`Call ${enquiry.name} again`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save(custom)} disabled={saving}>
            Save date
          </Button>
        </>
      }
    >
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Pick a day. One tap saves it.
      </p>
      <div style={{ ...actionsGrid, marginTop: space.md }}>
        {followUpPicks(today).map((p) => (
          <Button key={p.date} variant="ghost" onClick={() => void save(p.date)} disabled={saving}>
            {p.label}
          </Button>
        ))}
      </div>
      <TextField
        label="Or pick a date"
        value={custom}
        onChange={(v) => {
          setCustom(v);
          setError(null);
        }}
        type="date"
        error={error}
        hint={custom ? relativeDay(custom, today) : undefined}
      />
    </Sheet>
  );
}

// ---------------------------------------------------------------- make them a member

/**
 * "Member banao": the usual Add member form with the name and number filled in. When the member is
 * saved, the enquiry closes as joined (linked to them) and their page opens. If the number is
 * already on the roster, the form would refuse it — so offer to link that member instead.
 */
function ConvertFlow({
  enquiry,
  members,
  onClose,
  onError,
  onJoined,
}: {
  enquiry: Enquiry;
  members: readonly Member[];
  onClose: () => void;
  onError: (message: string) => void;
  /** Opens the member's page, or first the F147 thank-you for a friend a member invited. */
  onJoined: (member: Member) => void;
}) {
  const { snapshot, today, memberViews, updateEnquiry, setMemberArchived } = useCrm();
  // Frozen when the flow opens: bringing an archived member back must not swap this sheet for the
  // "Already a member" one half-way through.
  const [existing] = useState(() => findDuplicatePhone(members, enquiry.phone));
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // R-513: a "Become a member" request goes on to Sell membership, opened on the plan and day they picked.
  const [sellPlan] = useState(() => sellPlanFor(selfJoinOf(enquiry), snapshot.plans));
  const [selling, setSelling] = useState<Member | null>(null);
  const added = useRef(false);

  /** 'selling': the flow stays open for Sell membership; 'done': the caller closes it. */
  const link = async (member: Member): Promise<'selling' | 'done'> => {
    try {
      await updateEnquiry(enquiry.id, { status: 'joined', memberId: member.id });
      if (sellPlan) {
        setSelling(member);
        return 'selling';
      }
      onJoined(member);
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : 'The member was saved, but the enquiry was not closed.',
      );
      if (added.current) onClose();
    }
    return 'done';
  };

  if (selling) {
    // The new member's view arrives with the next draw after saving.
    const view = memberViews.find((v) => v.member.id === selling.id);
    if (!view) return null;
    return (
      <SellMembershipSheet
        view={view}
        initialPlanId={sellPlan}
        initialStartsOn={sellStartFor(selfJoinOf(enquiry), today)}
        onClose={() => {
          onJoined(selling);
          onClose();
        }}
      />
    );
  }

  if (existing?.archived) {
    // The number belongs to someone who was archived: the Add form would refuse it, and the
    // owner cannot see them in the roster. Bring them back and link the enquiry in one tap.
    return (
      <Sheet
        title="Already a member (archived)"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              wrap
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setRestoreError(null);
                try {
                  await setMemberArchived(existing.id, false);
                } catch (e) {
                  setRestoreError(e instanceof Error ? e.message : 'Could not restore that member.');
                  setBusy(false);
                  return;
                }
                const next = await link({ ...existing, archived: false });
                setBusy(false);
                if (next === 'done') onClose();
              }}
            >
              Bring back and mark joined
            </Button>
          </>
        }
      >
        {restoreError && <ErrorBanner>{restoreError}</ErrorBanner>}
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.ink, overflowWrap: 'anywhere' }}>
          {`${existing.fullName} already has ${formatPhone(enquiry.phone)}, but they were archived, so they are not in the list.`}
        </p>
      </Sheet>
    );
  }

  if (existing) {
    return (
      <Sheet
        title="Already a member"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const next = await link(existing);
                setBusy(false);
                if (next === 'done') onClose();
              }}
            >
              Mark joined and open
            </Button>
          </>
        }
      >
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.ink }}>
          {`${existing.fullName} is already a member with ${formatPhone(enquiry.phone)}.`}
        </p>
      </Sheet>
    );
  }

  return (
    <MemberFormSheet
      initial={memberPrefill(enquiry)}
      onClose={() => {
        // Saved with a plan to sell next: the flow stays open (link above opens Sell membership).
        if (!added.current || !sellPlan) onClose();
      }}
      onSaved={(member) => {
        added.current = true;
        void link(member);
      }}
    />
  );
}

// ---------------------------------------------------------------- F147: thank the member who brought them

/**
 * One tap by the owner: add the gym's free days to the plan of the member who invited this friend.
 * Opens right after "Add as member" for a referred friend, or from the joined row's button. Never
 * automatic; "Not now" leaves the button on the row for later.
 */
function ThankSheet({
  reward,
  friendName,
  afterJoin,
  onGive,
  onClose,
}: {
  reward: FriendReward;
  friendName: string;
  /** Opened straight after "Add as member": closing opens the new member's page. */
  afterJoin: boolean;
  onGive: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ by: string; days: number; to: string } | null>(null);
  const p = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.ink, overflowWrap: 'anywhere' } as const;
  const closeWords = afterJoin ? `Open ${friendName}` : 'Close';

  if (done) {
    return (
      <Sheet title="Free days added" onClose={onClose} footer={<Button onClick={onClose}>{closeWords}</Button>}>
        <p style={p}>{`${done.by} got ${done.days} free ${done.days === 1 ? 'day' : 'days'}. Their plan now ends on ${formatDay(done.to)}.`}</p>
      </Sheet>
    );
  }
  if (reward.kind !== 'ready') {
    return (
      <Sheet title="Free days" onClose={onClose} footer={<Button onClick={onClose}>{closeWords}</Button>}>
        <p style={p}>{reward.kind === 'none' ? 'There are no free days to give for this friend.' : rewardNote(reward)}</p>
      </Sheet>
    );
  }
  const days = `${reward.days} free ${reward.days === 1 ? 'day' : 'days'}`;
  return (
    <Sheet
      title={`Thank ${reward.by}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Not now
          </Button>
          <Button
            wrap
            needsInternet
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onGive();
                setDone({ by: reward.by, days: reward.days, to: reward.newEnd });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not add the free days. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {`Give ${days}`}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={p}>{`${friendName} joined. ${reward.by} invited them from the MettleUp app.`}</p>
      <p style={p}>{`${reward.by}’s plan ends on ${formatDay(reward.membership.endsOn)}. With ${days} it ends on ${formatDay(reward.newEnd)}.`}</p>
      <p style={{ ...p, fontSize: 13, color: color.inkSecondary }}>
        You set these free days in Settings → Member app. If you tap Not now, you can still give them later from this enquiry.
      </p>
    </Sheet>
  );
}
