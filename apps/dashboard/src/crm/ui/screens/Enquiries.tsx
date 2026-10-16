/**
 * Enquiries (Gym Panel step 5, 15 Oct 2026) — people who asked about joining and have not joined
 * yet. GoGym4U and GymBook both have this; owners open it every morning to see who to call.
 *
 * The default chip is "who to call today" (overdue + due today, the longest overdue first). Each
 * row is one person with the four things an owner does next: call, WhatsApp, make them a member,
 * or move the call to another day — and "Nahi aayenge" to close it, with an undo.
 * The bucket and message rules live in logic/enquiries.ts (pure, tested).
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { useCrm } from '../../store';
import { tr } from '../../i18n';
import { formatDay, relativeDay } from '../../logic/dates';
import {
  emptyEnquiryForm,
  enquiryBucket,
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
import { DIAL_CODES, findDuplicatePhone, formatPhone, normalizePhone, phoneDigits } from '../../logic/members';
import { whatsAppHref } from '../../shop/invite';
import type { Enquiry, Member } from '../../types';
import { MemberFormSheet } from '../forms/MemberFormSheet';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  Row,
  SelectField,
  Sheet,
  TextField,
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
      return tr('Follow up today', 'Aaj call karo');
    case 'later':
      return tr('Later', 'Baad mein');
    case 'joined':
      return tr('Joined', 'Member ban gaye');
    case 'lost':
      return tr('Not interested', 'Nahi aayenge');
    case 'all':
      return tr('All', 'Sab');
  }
}

export function EnquiriesScreen() {
  const { snapshot, today, updateEnquiry } = useCrm();
  const enquiries = snapshot.enquiries ?? [];
  const [filter, setFilter] = useState<EnquiryFilter>('due');
  const [adding, setAdding] = useState(false);
  const [rescheduling, setRescheduling] = useState<Enquiry | null>(null);
  const [converting, setConverting] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Enquiry | null>(null);

  const counts = useMemo(() => filterCounts(enquiries, today), [enquiries, today]);
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
      setError(e instanceof Error ? e.message : tr('Could not save that.', 'Save nahi hua.'));
    }
  }, []);

  const markLost = (e: Enquiry) =>
    run(async () => {
      await updateEnquiry(e.id, { status: 'lost' });
      setUndo(e);
    });

  const reopen = (e: Enquiry) =>
    run(async () => {
      await updateEnquiry(e.id, { status: 'open' });
      setUndo(null);
    });

  const addButton = <Button onClick={() => setAdding(true)}>{tr('+ Add enquiry', '+ Nayi enquiry')}</Button>;

  return (
    <>
      <PageHeader
        title={tr('Enquiries', 'Enquiry')}
        subtitle={tr('People who asked about joining', 'Jinhone gym ke baare mein poocha')}
        actions={addButton}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          label={tr('Show enquiries', 'Enquiry dikhao')}
          value={filter}
          onChange={(v) => setFilter(v as EnquiryFilter)}
          options={ENQUIRY_FILTERS.map((f) => ({ value: f, label: filterLabel(f), count: counts[f] }))}
        />
      </div>

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
            />
          ))}
        </Card>
      )}

      {undo && (
        <UndoBar
          message={tr(`${undo.name}: marked not interested.`, `${undo.name}: Nahi aayenge.`)}
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
        />
      )}
    </>
  );
}

function EmptyEnquiries({ filter, total, action }: { filter: EnquiryFilter; total: number; action: ReactNode }) {
  if (total === 0) {
    return (
      <EmptyState
        title={tr('No enquiries yet', 'Abhi koi enquiry nahi')}
        body={tr(
          'When someone walks in or calls to ask about joining, add them here with a day to call back.',
          'Jab koi gym ke baare mein poochne aaye ya call kare, unhe yahan jodo aur dobara call ka din rakho.',
        )}
        action={action}
      />
    );
  }
  const [title, body] =
    filter === 'due'
      ? [tr('Nobody to call today', 'Aaj kisi ko call nahi karna'), tr('Every follow-up is on a later day.', 'Saari follow-up aage ke din par hain.')]
      : filter === 'later'
        ? [tr('Nothing scheduled later', 'Aage koi call nahi'), undefined]
        : filter === 'joined'
          ? [tr('Nobody has joined from an enquiry yet', 'Enquiry se abhi koi member nahi bana'), undefined]
          : filter === 'lost'
            ? [tr('Nobody marked not interested', 'Kisi ko “Nahi aayenge” nahi kiya'), undefined]
            : [tr('No enquiries', 'Koi enquiry nahi'), undefined];
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
}: {
  enquiry: Enquiry;
  first: boolean;
  today: string;
  gymName: string;
  onConvert: () => void;
  onReschedule: () => void;
  onLost: () => void;
  onReopen: () => void;
}) {
  const bucket = enquiryBucket(e, today);
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
          {e.interest && (
            <div style={{ fontFamily: font.body, fontSize: 13, color: color.ink, marginTop: 4, overflowWrap: 'anywhere' }}>
              {e.interest}
            </div>
          )}
          {open && (
            <div style={{ fontFamily: font.body, fontSize: 12, fontWeight: 600, color: followTone, marginTop: 4 }}>
              {e.followUpOn
                ? tr(
                    `Call back ${formatDay(e.followUpOn)} · ${relativeDay(e.followUpOn, today)}`,
                    `Dobara call ${formatDay(e.followUpOn)} · ${relativeDay(e.followUpOn, today)}`,
                  )
                : tr('No call-back day set', 'Dobara call ka din nahi rakha')}
            </div>
          )}
        </div>
        <StatusPill bucket={bucket} />
      </div>

      <div style={actionsGrid}>
        <a href={`tel:+${phoneDigits(e.phone)}`} style={linkButton} aria-label={tr(`Call ${e.name}`, `${e.name} ko Call karo`)}>
          {tr('Call', 'Call karo')}
        </a>
        <a
          href={whatsAppHref(followUpMessage(e, { name: gymName }), e.phone)}
          target="_blank"
          rel="noreferrer"
          style={linkButton}
          aria-label={tr(`WhatsApp ${e.name}`, `${e.name} ko WhatsApp bhejo`)}
        >
          {tr('WhatsApp', 'WhatsApp bhejo')}
        </a>
        {open && (
          <>
            <Button wrap onClick={onConvert} ariaLabel={tr(`Make ${e.name} a member`, `${e.name} ko Member banao`)}>
              {tr('Convert to member', 'Member banao')}
            </Button>
            <Button wrap variant="ghost" onClick={onReschedule} ariaLabel={tr(`Change follow-up date for ${e.name}`, `${e.name}: Dobara call kab`)}>
              {tr('Follow-up date', 'Dobara call kab')}
            </Button>
            <Button wrap variant="quiet" tone="danger" onClick={onLost} ariaLabel={tr(`${e.name} is not interested`, `${e.name} Nahi aayenge`)}>
              {tr('Not interested', 'Nahi aayenge')}
            </Button>
          </>
        )}
        {e.status === 'joined' && e.memberId && (
          <Button wrap variant="ghost" onClick={() => navigate(`/members/${e.memberId}`)}>
            {tr('Open member', 'Member dekho')}
          </Button>
        )}
        {e.status === 'lost' && (
          <Button wrap variant="ghost" onClick={onReopen} ariaLabel={tr(`Reopen ${e.name}`, `${e.name} ko wapas kholo`)}>
            {tr('Reopen', 'Wapas kholo')}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ bucket }: { bucket: ReturnType<typeof enquiryBucket> }) {
  switch (bucket) {
    case 'overdue':
      return <Pill tone="critical">{tr('Overdue', 'Late ho gaya')}</Pill>;
    case 'today':
      return <Pill tone="warn">{tr('Today', 'Aaj')}</Pill>;
    case 'joined':
      return <Pill tone="good">{tr('Joined', 'Member bana')}</Pill>;
    case 'lost':
      return <Pill tone="muted">{tr('Not interested', 'Nahi aayenge')}</Pill>;
    default:
      return null;
  }
}

/**
 * Two buttons a row on a 375px phone, more on a wider screen, one a row on a very narrow one;
 * every one at least 44px tall. A label too long for its half ("Convert to member", a Hinglish
 * one) wraps onto a second line inside its button instead of spilling out of it.
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

function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 92,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        background: color.surfaceRaised,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.pill,
        padding: '4px 6px 4px 18px',
        color: color.ink,
        fontFamily: font.body,
        fontSize: 14,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{message}</span>
      <Button variant="ghost" onClick={onUndo}>
        {tr('Undo', 'Undo karo')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- add

function AddEnquirySheet({ onClose }: { onClose: () => void }) {
  const { snapshot, today, createEnquiry } = useCrm();
  const [form, setForm] = useState<EnquiryFormDraft>(() => emptyEnquiryForm(today));
  const [fieldError, setFieldError] = useState<{ field: EnquiryField; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // C7-1: one id for this sheet's save, so a second press after "no internet" saves once.
  const [requestId] = useState(newRequestId);

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
      await createEnquiry({ ...result.value, requestId });
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr('Could not save this enquiry.', 'Enquiry save nahi hui.'));
    } finally {
      setSaving(false);
    }
  };

  const phoneNote = member
    ? tr(
        `${member.fullName} is already a member with this number.`,
        `${member.fullName} is number se pehle se member hai.`,
      )
    : dupe
      ? tr(
          `${dupe.name} already asked from this number${dupe.followUpOn ? ` (call back ${formatDay(dupe.followUpOn)})` : ''}. You can still save.`,
          `${dupe.name} ne is number se pehle bhi poocha tha${dupe.followUpOn ? ` (dobara call ${formatDay(dupe.followUpOn)})` : ''}. Phir bhi save kar sakte ho.`,
        )
      : undefined;

  return (
    <Sheet
      title={tr('Add enquiry', 'Nayi enquiry')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? tr('Saving…', 'Save ho raha hai…') : tr('Save enquiry', 'Enquiry save karo')}
          </Button>
        </>
      }
    >
      {formError && <ErrorBanner>{formError}</ErrorBanner>}

      <TextField
        label={tr('Name', 'Naam')}
        value={form.name}
        onChange={set('name')}
        error={errorFor('name')}
        autoFocus
        placeholder="Rohit Meena"
      />

      <Row gap={space.sm} align="flex-start">
        <div style={{ width: 110 }}>
          <SelectField label={tr('Code', 'Code')} value={form.dialCode} onChange={set('dialCode')} options={dialOptions} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label={tr('Mobile number', 'Mobile number')}
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
        label={tr('Interested in (optional)', 'Kya chahiye (zaroori nahi)')}
        value={form.interest}
        onChange={set('interest')}
        error={errorFor('interest')}
        placeholder={tr('3 months, evening batch', '3 months, evening batch')}
      />

      <TextField
        label={tr('Follow-up date', 'Dobara call kab')}
        value={form.followUpOn}
        onChange={set('followUpOn')}
        type="date"
        error={errorFor('followUpOn')}
        hint={form.followUpOn ? relativeDay(form.followUpOn, today) : tr('No date: it goes under Later.', 'Date nahi: “Baad mein” mein jayegi.')}
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
      setError(tr('Pick a date.', 'Date chuno.'));
      return;
    }
    if (date < today) {
      setError(tr('The follow-up date can’t be in the past.', 'Dobara call ki date beete din ki nahi ho sakti.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateEnquiry(enquiry.id, { followUpOn: date });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not save that.', 'Save nahi hua.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={tr(`Call ${enquiry.name} again`, `${enquiry.name}: Dobara call kab`)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save(custom)} disabled={saving}>
            {tr('Save date', 'Date save karo')}
          </Button>
        </>
      }
    >
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {tr('Pick a day — one tap saves it.', 'Din chuno — ek tap mein save.')}
      </p>
      <div style={{ ...actionsGrid, marginTop: space.md }}>
        {followUpPicks(today).map((p) => (
          <Button key={p.date} variant="ghost" onClick={() => void save(p.date)} disabled={saving}>
            {p.label}
          </Button>
        ))}
      </div>
      <TextField
        label={tr('Or pick a date', 'Ya date chuno')}
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
}: {
  enquiry: Enquiry;
  members: readonly Member[];
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const { updateEnquiry, setMemberArchived } = useCrm();
  // Frozen when the flow opens: bringing an archived member back must not swap this sheet for the
  // "Already a member" one half-way through.
  const [existing] = useState(() => findDuplicatePhone(members, enquiry.phone));
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const link = async (member: Member) => {
    try {
      await updateEnquiry(enquiry.id, { status: 'joined', memberId: member.id });
      navigate(`/members/${member.id}`);
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : tr('The member was saved, but the enquiry was not closed.', 'Member ban gaya, par enquiry band nahi hui.'),
      );
    }
  };

  if (existing?.archived) {
    // The number belongs to someone who was archived: the Add form would refuse it, and the
    // owner cannot see them in the roster. Bring them back and link the enquiry in one tap.
    return (
      <Sheet
        title={tr('Already a member (archived)', 'Pehle se member hain (archive mein)')}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {tr('Cancel', 'Cancel')}
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
                  setRestoreError(e instanceof Error ? e.message : tr('Could not restore that member.', 'Member wapas nahi aaya.'));
                  setBusy(false);
                  return;
                }
                await link({ ...existing, archived: false });
                setBusy(false);
                onClose();
              }}
            >
              {tr(`Bring back ${existing.fullName} and link`, `${existing.fullName} ko wapas lao aur jodo`)}
            </Button>
          </>
        }
      >
        {restoreError && <ErrorBanner>{restoreError}</ErrorBanner>}
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.ink, overflowWrap: 'anywhere' }}>
          {tr(
            `${existing.fullName} already has ${formatPhone(enquiry.phone)}, but they were archived, so they are not in the list.`,
            `${existing.fullName} ke paas ${formatPhone(enquiry.phone)} number hai, par woh archive mein hain, isliye list mein nahi dikhte.`,
          )}
        </p>
      </Sheet>
    );
  }

  if (existing) {
    return (
      <Sheet
        title={tr('Already a member', 'Pehle se member hain')}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {tr('Cancel', 'Cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await link(existing);
                setBusy(false);
                onClose();
              }}
            >
              {tr('Mark joined and open', 'Joined karo aur kholo')}
            </Button>
          </>
        }
      >
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.ink }}>
          {tr(
            `${existing.fullName} is already on the roster with ${formatPhone(enquiry.phone)}.`,
            `${existing.fullName} ${formatPhone(enquiry.phone)} number se pehle se member hai.`,
          )}
        </p>
      </Sheet>
    );
  }

  return (
    <MemberFormSheet
      initial={{ fullName: enquiry.name, phone: enquiry.phone }}
      onClose={onClose}
      onSaved={(member) => void link(member)}
    />
  );
}
