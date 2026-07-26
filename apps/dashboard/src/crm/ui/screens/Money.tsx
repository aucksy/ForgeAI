/**
 * Money — the gym's cash book, and the list of who still owes.
 *
 * Two jobs a value gym does today on paper. "What came in this month, and by which
 * method" is the number the owner reconciles against the cash box every evening, so
 * the totals shown here ALWAYS describe exactly the rows listed underneath them: any
 * filter that narrows the list narrows the totals too. A report that disagrees with
 * the rows it sits on top of is a report nobody trusts twice.
 *
 * The dues side leads with AGE, not amount. ₹2,000 owed since last week and ₹2,000
 * owed since March are the same number and a completely different phone call.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCrm } from '../../store';
import { formatDay, formatDayShort, isValidDateISO } from '../../logic/dates';
import {
  AGING_LABEL,
  agingTotals,
  buildLedger,
  collectionSummary,
  duesByMember,
  duesLedger,
  filterLedger,
  presetRange,
  RANGE_PRESETS,
  type AgingBucket,
  type DateRange,
  type LedgerRow,
  type RangePresetId,
} from '../../logic/collections';
import { csvDocument, csvFilename } from '../../logic/csv';
import { formatINR, formatINRShort, paiseToRupees, sumPaise } from '../../logic/money';
import { formatPhone, phoneForExport } from '../../logic/members';
import { methodLabel, methodOptions } from '../../logic/payments';
import type { MemberView, Payment, PaymentMethod } from '../../types';
import { CollectPaymentSheet } from '../forms/CollectPaymentSheet';
import { VoidPaymentSheet } from '../forms/VoidPaymentSheet';
import { downloadCsv } from '../download';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Pill,
  Row,
  ScrollX,
  SearchField,
  SectionTitle,
  SelectField,
  StatTile,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
  useIsCompact,
} from '../kit';
import { Link, navigate } from '../router';

type Tab = 'collections' | 'dues';

export function MoneyScreen({ section }: { section?: string }) {
  const tab: Tab = section === 'dues' ? 'dues' : 'collections';

  // A toast with no timer is a banner. `Toast` is presentational — every other
  // screen pairs it with this dismissal, and without it "Receipt voided" sat
  // pinned over the content for the rest of the session. The counter is what lets
  // the SAME message fire twice: two exports in a row must both be acknowledged,
  // and setting identical state is a no-op.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastSeq = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (text: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={tab === 'dues' ? 'Everything still owed to the gym' : 'Every rupee that came in'}
      />

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          label="Money view"
          value={tab}
          onChange={(v) => navigate(v === 'dues' ? '/money/dues' : '/money')}
          options={[
            { value: 'collections', label: 'Collections' },
            { value: 'dues', label: 'Dues' },
          ]}
        />
      </div>

      {tab === 'collections' ? <Collections onToast={flash} /> : <Dues onToast={flash} />}

      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

// ---------------------------------------------------------------- collections

function Collections({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today } = useCrm();
  const compact = useIsCompact();

  const [presetId, setPresetId] = useState<RangePresetId | 'custom'>('thisMonth');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('thisMonth', today));
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [query, setQuery] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);

  // A half-typed date in a `type="date"` field arrives as '' or as a partial
  // string. Falling back to the preset keeps the whole page from blanking out
  // mid-keystroke rather than throwing inside the date maths.
  const range = useMemo<DateRange>(() => {
    if (presetId !== 'custom') return presetRange(presetId, today);
    const from = isValidDateISO(custom.from) ? custom.from : today;
    const to = isValidDateISO(custom.to) ? custom.to : today;
    return { from, to };
  }, [presetId, custom, today]);

  const allRows = useMemo(
    () => buildLedger(snapshot.payments, snapshot.members, snapshot.memberships),
    [snapshot],
  );

  const visible = useMemo(
    () => filterLedger(allRows, { range, method, query, includeVoided }),
    [allRows, range, method, query, includeVoided],
  );

  // The summary always covers the SAME population as the table, plus the voided
  // rows the table may be hiding — so the two can never tell different stories.
  const summary = useMemo(() => {
    const population = filterLedger(allRows, { range, method, query, includeVoided: true }).map(
      (r) => r.payment,
    );
    return collectionSummary(population, range);
  }, [allRows, range, method, query]);

  const usePreset = (id: RangePresetId | 'custom') => {
    setPresetId(id);
    if (id !== 'custom') setCustom(presetRange(id, today));
  };

  const exportCsv = () => {
    const contents = csvDocument(
      ['Receipt no', 'Date', 'Member', 'Mobile', 'Membership', 'Method', 'Reference', 'Amount (INR)', 'Status'],
      visible.map((r) => [
        r.payment.receiptNo,
        r.payment.paidOn,
        r.member?.fullName ?? 'Unknown member',
        r.member ? phoneForExport(r.member.phone) : '',
        r.membership?.planName ?? '',
        methodLabel(r.payment.method),
        r.payment.reference ?? '',
        // A number, not a formatted string: the accountant has to be able to sum
        // this column without stripping ₹ and commas out of it first.
        paiseToRupees(r.payment.amountP),
        r.payment.voided ? `Voided: ${r.payment.voidReason ?? 'no reason given'}` : 'Received',
      ]),
    );
    downloadCsv(csvFilename([snapshot.gym.name, 'collections', range.from, range.to]), contents);
    onToast(`Exported ${visible.length} ${visible.length === 1 ? 'receipt' : 'receipts'}.`);
  };

  const filterNote = [
    `${formatDay(range.from)} → ${formatDay(range.to)}`,
    method === 'all' ? null : methodLabel(method),
    query.trim() ? `“${query.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Period</SectionTitle>
        <ChipToggle
          label="Period"
          value={presetId}
          onChange={(v) => usePreset(v as RangePresetId | 'custom')}
          options={[...RANGE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
        />
        {presetId === 'custom' && (
          <Grid min={200}>
            <TextField
              label="From"
              type="date"
              value={custom.from}
              onChange={(v) => setCustom((c) => ({ ...c, from: v }))}
            />
            <TextField
              label="To"
              type="date"
              value={custom.to}
              onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
            />
          </Grid>
        )}
      </Card>

      <Grid min={165}>
        <StatTile
          label="Collected"
          value={formatINRShort(summary.netP)}
          tone="good"
          sub={`${summary.receiptsN} ${summary.receiptsN === 1 ? 'receipt' : 'receipts'}`}
        />
        <StatTile label="Average receipt" value={formatINRShort(summary.averageP)} />
        <StatTile label="Largest" value={formatINRShort(summary.largestP)} />
        <StatTile
          label="Voided"
          value={formatINRShort(summary.voidedP)}
          tone={summary.voidedN > 0 ? 'critical' : undefined}
          sub={`${summary.voidedN} not counted`}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>How it came in</SectionTitle>
        {summary.netP === 0 ? (
          <EmptyState title="Nothing collected in this period" />
        ) : (
          <div style={{ display: 'grid', gap: space.sm }}>
            {summary.byMethod
              .filter((m) => m.amountP > 0)
              .sort((a, b) => b.amountP - a.amountP)
              .map((m) => (
                <MethodBar
                  key={m.method}
                  label={methodLabel(m.method)}
                  amountP={m.amountP}
                  countN={m.countN}
                  share={summary.netP === 0 ? 0 : m.amountP / summary.netP}
                />
              ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          action={
            <Button variant="ghost" onClick={exportCsv} disabled={visible.length === 0}>
              Export CSV
            </Button>
          }
        >
          Receipts
        </SectionTitle>

        <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: -space.sm, marginBottom: space.md }}>
          {filterNote}
        </div>

        <Row gap={space.sm}>
          <SearchField value={query} onChange={setQuery} placeholder="Receipt no, name, mobile or reference" />
          <div style={{ minWidth: 180 }}>
            <SelectField
              label="Method"
              value={method}
              onChange={(v) => setMethod(v as PaymentMethod | 'all')}
              options={[{ value: 'all', label: 'All methods' }, ...methodOptions()]}
            />
          </div>
        </Row>

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: space.sm,
            minHeight: 44,
            fontFamily: font.body,
            fontSize: 13,
            color: color.inkSecondary,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
          />
          Show voided receipts
        </label>

        {visible.length === 0 ? (
          <EmptyState
            title="No receipts here"
            body="Nothing matches this period and these filters."
          />
        ) : compact ? (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
            {visible.map((r) => (
              <LedgerCard key={r.payment.id} row={r} onVoid={() => setVoiding(r.payment)} />
            ))}
          </div>
        ) : (
          <ScrollX>
            <table style={{ marginTop: space.md, minWidth: 780 }}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Receipt</Th>
                  <Th>Member</Th>
                  <Th>For</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <LedgerTableRow key={r.payment.id} row={r} onVoid={() => setVoiding(r.payment)} />
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      {voiding && (
        <VoidPaymentSheet
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={(restored) =>
            onToast(restored ? 'Receipt voided. The amount is back on their dues.' : 'Receipt voided.')
          }
        />
      )}
    </>
  );
}

function MethodBar({
  label,
  amountP,
  countN,
  share,
}: {
  label: string;
  amountP: number;
  countN: number;
  share: number;
}) {
  const pct = Math.round(share * 100);
  return (
    <div>
      <Row gap={space.sm} wrap={false}>
        <span style={{ fontFamily: font.body, fontSize: 13, color: color.ink, flex: 1, minWidth: 0 }}>
          {label}
          <span style={{ color: color.inkMuted }}> · {countN}</span>
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>{formatINR(amountP)}</span>
        <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, minWidth: 38, textAlign: 'right' }}>
          {pct}%
        </span>
      </Row>
      <div
        aria-hidden
        style={{
          height: 6,
          marginTop: 5,
          borderRadius: radius.pill,
          background: color.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', background: color.accent }} />
      </div>
    </div>
  );
}

function LedgerTableRow({ row, onVoid }: { row: LedgerRow; onVoid: () => void }) {
  const { payment, member, membership } = row;
  return (
    <tr>
      <Td>{formatDayShort(payment.paidOn)}</Td>
      <Td mono>
        <Link to={`/receipts/${payment.id}`}>
          <span style={{ color: color.accentBright }}>{payment.receiptNo}</span>
        </Link>
      </Td>
      <Td>
        {member ? (
          <Link to={`/members/${member.id}`}>
            <span style={{ color: color.ink }}>{member.fullName}</span>
          </Link>
        ) : (
          <span style={{ color: color.inkFaint }}>Unknown member</span>
        )}
      </Td>
      <Td>{membership?.planName ?? '—'}</Td>
      <Td>
        {methodLabel(payment.method)}
        {payment.reference ? (
          <span style={{ color: color.inkMuted }}> · {payment.reference}</span>
        ) : null}
      </Td>
      <Td align="right" mono>
        <span
          style={{
            color: payment.voided ? color.inkFaint : color.ink,
            textDecoration: payment.voided ? 'line-through' : undefined,
            fontWeight: 700,
          }}
        >
          {formatINR(payment.amountP)}
        </span>
        {payment.voided && (
          // Never colour alone: struck-through text reads as a normal amount to a
          // screen reader, and as a normal amount on a mono printer.
          <div style={{ fontSize: 11, color: color.criticalText, fontFamily: font.body }}>VOIDED</div>
        )}
      </Td>
      <Td align="right">
        {!payment.voided && (
          <Button variant="quiet" tone="danger" onClick={onVoid}>
            Void
          </Button>
        )}
      </Td>
    </tr>
  );
}

function LedgerCard({ row, onVoid }: { row: LedgerRow; onVoid: () => void }) {
  const { payment, member, membership } = row;
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space.md,
        background: color.surfaceSunken,
      }}
    >
      {/* Every tappable thing on this card is a 44px target. Two links stacked at
          their natural 19px each are a coin-flip under a thumb, and the kit
          committed to 44 in P1 — a new screen must not undo that. */}
      <Row gap={space.sm} wrap={false}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {member ? (
            <Link to={`/members/${member.id}`}>
              <span style={{ ...tapTarget, fontSize: 14, fontWeight: 600, color: color.ink }}>
                {member.fullName}
              </span>
            </Link>
          ) : (
            <span style={{ ...tapTarget, fontSize: 14, color: color.inkFaint }}>Unknown member</span>
          )}
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary }}>
            {formatDay(payment.paidOn)} · {methodLabel(payment.method)}
            {membership ? ` · ${membership.planName}` : ''}
          </div>
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 15,
            fontWeight: 700,
            color: payment.voided ? color.inkFaint : color.ink,
            textDecoration: payment.voided ? 'line-through' : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {formatINR(payment.amountP)}
        </div>
      </Row>

      <Row gap={space.sm} wrap={false}>
        <Link to={`/receipts/${payment.id}`} title="Open printable receipt">
          <span style={{ ...tapTarget, fontFamily: font.mono, fontSize: 12, color: color.accentBright }}>
            {payment.receiptNo}
          </span>
        </Link>
        <span style={{ flex: 1 }} />
        {payment.voided ? (
          <span style={{ ...tapTarget, fontSize: 11, color: color.criticalText }}>VOIDED</span>
        ) : (
          <Button variant="quiet" tone="danger" onClick={onVoid}>
            Void
          </Button>
        )}
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- dues

const BUCKET_TONE: Record<AgingBucket, 'good' | 'warn' | 'critical' | 'muted'> = {
  upcoming: 'muted',
  d0_30: 'good',
  d31_60: 'warn',
  d60plus: 'critical',
};

/** A stat tile has no muted tone — an unfilled bucket simply reads as ordinary. */
function tileTone(bucket: AgingBucket): 'good' | 'warn' | 'critical' | undefined {
  const tone = BUCKET_TONE[bucket];
  return tone === 'muted' ? undefined : tone;
}

function Dues({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today, viewFor } = useCrm();
  const compact = useIsCompact();
  const [collecting, setCollecting] = useState<MemberView | null>(null);
  const [bucket, setBucket] = useState<AgingBucket | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  // Over EVERY member including archived ones: archiving somebody does not cancel
  // what they owe, and a dues total that drops when the roster is tidied is a way
  // to lose real money.
  const rows = useMemo(
    () => duesLedger(snapshot.members, snapshot.memberships, snapshot.payments, today),
    [snapshot, today],
  );

  const totals = useMemo(() => agingTotals(rows), [rows]);

  const allPeople = useMemo(() => duesByMember(rows), [rows]);
  const people = useMemo(
    () => allPeople.filter((p) => bucket === 'all' || p.bucket === bucket),
    [allPeople, bucket],
  );

  // Follows the bucket filter, like every other number on this screen. A headline
  // "Total owed ₹1.2L" above a list summing ₹30,000 is the exact disagreement
  // between a total and its rows that this screen exists to avoid.
  const shownRows = useMemo(() => people.flatMap((p) => p.terms), [people]);
  const owedP = useMemo(() => sumPaise(shownRows.map((r) => r.unpaidP)), [shownRows]);

  const exportCsv = () => {
    // Exports what is on screen, matching the Collections tab. Exporting all 42
    // dues from a list filtered to 5 is a file that quietly disagrees with the
    // screen it came from.
    const contents = csvDocument(
      ['Member', 'Mobile', 'Membership', 'Started', 'Days outstanding', 'Age', 'Amount due (INR)', 'Archived'],
      shownRows.map((r) => [
        r.member.fullName,
        phoneForExport(r.member.phone),
        r.membership.planName,
        r.membership.startsOn,
        r.ageDays,
        AGING_LABEL[r.bucket],
        paiseToRupees(r.unpaidP),
        r.member.archived ? 'Yes' : 'No',
      ]),
    );
    downloadCsv(csvFilename([snapshot.gym.name, 'dues', today]), contents);
    onToast(`Exported ${shownRows.length} ${shownRows.length === 1 ? 'due' : 'dues'}.`);
  };

  const openCollect = (memberId: string) => {
    const view = viewFor(memberId);
    if (!view) {
      setError('That member could not be opened. Try reloading the page.');
      return;
    }
    setError(null);
    setCollecting(view);
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nobody owes anything"
          body="Every membership on the roster is fully paid."
          action={<Button onClick={() => navigate('/members')}>Open roster</Button>}
        />
      </Card>
    );
  }

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Grid min={165}>
        <StatTile
          label="Total owed"
          value={formatINRShort(owedP)}
          tone="warn"
          sub={`${people.length} of ${allPeople.length} members shown`}
        />
        {totals.map((t) => (
          <StatTile
            key={t.bucket}
            label={AGING_LABEL[t.bucket]}
            value={formatINRShort(t.amountP)}
            tone={t.amountP > 0 ? tileTone(t.bucket) : undefined}
            sub={`${t.countN} ${t.countN === 1 ? 'membership' : 'memberships'}`}
          />
        ))}
      </Grid>

      <div style={{ height: space.lg }} />

      <Card>
        <SectionTitle
          action={
            <Button variant="ghost" onClick={exportCsv}>
              Export CSV
            </Button>
          }
        >
          Who owes
        </SectionTitle>

        <ChipToggle
          label="Filter by how old the debt is"
          value={bucket}
          onChange={(v) => setBucket(v as AgingBucket | 'all')}
          options={[
            { value: 'all', label: 'All' },
            ...totals.map((t) => ({ value: t.bucket, label: AGING_LABEL[t.bucket], count: t.countN })),
          ]}
        />

        {people.length === 0 ? (
          <EmptyState title="Nothing in this age group" />
        ) : compact ? (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
            {people.map((p) => (
              <div
                key={p.member.id}
                style={{
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.md,
                  padding: space.md,
                  background: color.surfaceSunken,
                }}
              >
                <Row gap={space.sm} wrap={false}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/members/${p.member.id}`}>
                      <span style={{ ...tapTarget, fontSize: 14, fontWeight: 600, color: color.ink }}>
                        {p.member.fullName}
                      </span>
                    </Link>
                    <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary }}>
                      {p.terms.length} {p.terms.length === 1 ? 'membership' : 'memberships'} ·{' '}
                      {ageLabel(p.oldestAgeDays)}
                    </div>
                    <Row gap={space.xs}>
                      <Pill tone={BUCKET_TONE[p.bucket]}>{AGING_LABEL[p.bucket]}</Pill>
                      {p.member.archived && <Pill tone="muted">Archived</Pill>}
                    </Row>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: color.warning }}>
                      {formatINR(p.totalP)}
                    </div>
                    <Button variant="quiet" onClick={() => openCollect(p.member.id)}>
                      Collect
                    </Button>
                  </div>
                </Row>
              </div>
            ))}
          </div>
        ) : (
          <ScrollX>
            <table style={{ marginTop: space.md, minWidth: 720 }}>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Mobile</Th>
                  <Th>Oldest debt</Th>
                  <Th>Age</Th>
                  <Th align="right">Owed</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.member.id}>
                    <Td>
                      <Link to={`/members/${p.member.id}`}>
                        <span style={{ color: color.ink }}>{p.member.fullName}</span>
                      </Link>
                      {p.member.archived && (
                        <span style={{ marginLeft: space.sm }}>
                          <Pill tone="muted">Archived</Pill>
                        </span>
                      )}
                    </Td>
                    <Td mono>{formatPhone(p.member.phone)}</Td>
                    <Td>{ageLabel(p.oldestAgeDays)}</Td>
                    <Td>
                      <Pill tone={BUCKET_TONE[p.bucket]}>{AGING_LABEL[p.bucket]}</Pill>
                    </Td>
                    <Td align="right" mono>
                      <span style={{ color: color.warning, fontWeight: 700 }}>{formatINR(p.totalP)}</span>
                    </Td>
                    <Td align="right">
                      <Button variant="quiet" onClick={() => openCollect(p.member.id)}>
                        Collect
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Card>

      {collecting && (
        <CollectPaymentSheet
          view={collecting}
          onClose={() => setCollecting(null)}
          onCollected={() => onToast('Payment recorded.')}
        />
      )}
    </>
  );
}

/**
 * An inline link that is still a comfortable thumb target. Text links default to
 * their line height (~19px); the kit's floor is 44.
 */
const tapTarget: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontFamily: font.body,
};

/** How long the money has been owed, in the plainest words available. */
function ageLabel(ageDays: number): string {
  if (ageDays < 0) return 'Not started yet';
  if (ageDays === 0) return 'Due today';
  return `${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
}

// ---------------------------------------------------------------- table bits

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: `0 ${space.md}px ${space.sm}px 0`,
        borderBottom: `1px solid ${color.border}`,
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: color.inkMuted,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: `${space.sm}px ${space.md}px ${space.sm}px 0`,
        borderBottom: `1px solid ${color.border}`,
        fontFamily: mono ? font.mono : font.body,
        fontSize: 13,
        color: color.inkSecondary,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
