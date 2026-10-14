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

import { useCan, useRole } from '../../auth/AuthProvider';
import { moneyTabFor, moneyTabs } from '../../auth/permissions';
import { useCrm } from '../../store';
import { formatDay, formatDayShort, isValidDateISO } from '../../logic/dates';
import {
  AGING_LABEL,
  agingLabel,
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
import { inEnglish, tr } from '../../i18n';

export function MoneyScreen({ section }: { section?: string }) {
  // Staff (front desk) gets only Dues — the PEOPLE to collect from — with no ₹ totals, charts or
  // exports; Collections is all totals (permissions.ts).
  const role = useRole();
  const tab = moneyTabFor(role, section);
  const tabs = moneyTabs(role);

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
        title={tr('Money', 'Hisaab')}
        subtitle={
          tab === 'dues'
            ? tabs.length > 1
              ? tr('Everything still owed to the gym', 'Gym ki saari fees baaki')
              : tr('Who still owes fees, to collect', 'Kiski fees baaki hai, lena hai')
            : tr('Every rupee that came in', 'Jo bhi paisa aaya')
        }
      />

      {tabs.length > 1 && (
        <div style={{ marginBottom: space.lg }}>
          <ChipToggle
            variant="tabs"
            label={tr('Money view', 'Hisaab dekho')}
            value={tab}
            onChange={(v) => navigate(v === 'dues' ? '/money/dues' : '/money')}
            options={[
              { value: 'collections', label: tr('Collections', 'Collection') },
              { value: 'dues', label: tr('Dues', 'Fees baaki') },
            ]}
          />
        </div>
      )}

      {tab === 'collections' ? (
        // `/money/today` (the home screen's "Today's collection" tile) opens on today.
        <Collections onToast={flash} startOn={section === 'today' ? 'today' : 'thisMonth'} />
      ) : (
        <Dues onToast={flash} />
      )}

      {toast && <Toast key={toast.id} message={toast.text} />}
    </>
  );
}

// ---------------------------------------------------------------- collections

function Collections({ onToast, startOn = 'thisMonth' }: { onToast: (msg: string) => void; startOn?: RangePresetId }) {
  const { snapshot, today } = useCrm();
  const compact = useIsCompact();

  const [presetId, setPresetId] = useState<RangePresetId | 'custom'>(startOn);
  const [custom, setCustom] = useState<DateRange>(() => presetRange(startOn, today));
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [query, setQuery] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const canVoid = useCan()('voidReceipt');

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
    // Downloads stay English in every language (an accountant reads them).
    const contents = inEnglish(() => csvDocument(
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
    ));
    downloadCsv(csvFilename([snapshot.gym.name, 'collections', range.from, range.to]), contents);
    onToast(
      visible.length === 1
        ? tr(`Exported ${visible.length} receipt.`, `${visible.length} raseed export hui.`)
        : tr(`Exported ${visible.length} receipts.`, `${visible.length} raseed export hui.`),
    );
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
        <SectionTitle>{tr('Period', 'Samay')}</SectionTitle>
        <ChipToggle
          label={tr('Period', 'Samay')}
          value={presetId}
          onChange={(v) => usePreset(v as RangePresetId | 'custom')}
          options={[...RANGE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: tr('Custom', 'Apni tareekh') }]}
        />
        {presetId === 'custom' && (
          <Grid min={200}>
            <TextField
              label={tr('From', 'Kab se')}
              type="date"
              value={custom.from}
              onChange={(v) => setCustom((c) => ({ ...c, from: v }))}
            />
            <TextField
              label={tr('To', 'Kab tak')}
              type="date"
              value={custom.to}
              onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
            />
          </Grid>
        )}
      </Card>

      <Grid min={165}>
        <StatTile
          label={tr('Collected', 'Collection')}
          value={formatINRShort(summary.netP)}
          tone="good"
          sub={
            summary.receiptsN === 1
              ? tr(`${summary.receiptsN} receipt`, `${summary.receiptsN} raseed`)
              : tr(`${summary.receiptsN} receipts`, `${summary.receiptsN} raseed`)
          }
        />
        <StatTile
          label={tr('Average receipt', 'Average raseed')}
          value={formatINRShort(summary.averageP)}
          sub={tr('Per payment in this period', 'Is samay mein har payment')}
        />
        <StatTile
          label={tr('Largest receipt', 'Sabse badi raseed')}
          value={formatINRShort(summary.largestP)}
          sub={tr('Single payment in this period', 'Is samay ki ek payment')}
        />
        <StatTile
          label={tr('Voided', 'Cancel hui')}
          value={formatINRShort(summary.voidedP)}
          tone={summary.voidedN > 0 ? 'critical' : undefined}
          sub={tr(`${summary.voidedN} not counted`, `${summary.voidedN} gini nahi gayi`)}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('How it came in', 'Kaise aaya')}</SectionTitle>
        {summary.netP === 0 ? (
          <EmptyState title={tr('Nothing collected in this period', 'Is samay koi collection nahi')} />
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
              {tr('Export CSV', 'CSV nikalo')}
            </Button>
          }
        >
          {tr('Receipts', 'Raseed')}
        </SectionTitle>

        <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: -space.sm, marginBottom: space.md }}>
          {filterNote}
        </div>

        {/* Both controls carry a label so their boxes sit on one line — the search
            had none and the Method box sat 16px lower beside it. On a phone each
            takes the full width instead of the select floating at half. */}
        <Row gap={space.sm} align="flex-end">
          <div style={{ flex: '2 1 260px', maxWidth: 440, minWidth: 0 }}>
            <TextField
              label={tr('Search', 'Dhoondo')}
              type="search"
              value={query}
              onChange={setQuery}
              placeholder={tr('Receipt no, name, mobile or reference', 'Raseed no, naam, mobile ya reference')}
            />
          </div>
          <div style={{ flex: '1 1 180px', maxWidth: compact ? undefined : 240, minWidth: 0 }}>
            <SelectField
              label={tr('Method', 'Kaise diya')}
              value={method}
              onChange={(v) => setMethod(v as PaymentMethod | 'all')}
              options={[{ value: 'all', label: tr('All methods', 'Sab tarike') }, ...methodOptions()]}
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
          {tr('Show voided receipts', 'Cancel hui raseed dikhao')}
        </label>

        {visible.length === 0 ? (
          <EmptyState
            title={tr('No receipts here', 'Yahan koi raseed nahi')}
            body={tr('Nothing matches this period and these filters.', 'Is samay aur in filters mein kuch nahi mila.')}
          />
        ) : compact ? (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
            {visible.map((r) => (
              <LedgerCard key={r.payment.id} row={r} onVoid={canVoid ? () => setVoiding(r.payment) : undefined} />
            ))}
          </div>
        ) : (
          <ScrollX>
            <table style={{ marginTop: space.md, minWidth: 780 }}>
              <thead>
                <tr>
                  <Th>{tr('Date', 'Tareekh')}</Th>
                  <Th>{tr('Receipt', 'Raseed')}</Th>
                  <Th>{tr('Member', 'Member')}</Th>
                  <Th>{tr('For', 'Kiske liye')}</Th>
                  <Th>{tr('Method', 'Kaise diya')}</Th>
                  <Th align="right">{tr('Amount', 'Rakam')}</Th>
                  <Th align="right">{tr('Actions', 'Kaam')}</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <LedgerTableRow key={r.payment.id} row={r} onVoid={canVoid ? () => setVoiding(r.payment) : undefined} />
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
            onToast(
              restored
                ? tr(
                    'Receipt voided. The amount is back on their dues.',
                    'Raseed cancel ho gayi. Rakam wapas fees baaki mein jud gayi.',
                  )
                : tr('Receipt voided.', 'Raseed cancel ho gayi.'),
            )
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

function LedgerTableRow({ row, onVoid }: { row: LedgerRow; onVoid?: () => void }) {
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
          <span style={{ color: color.inkMuted }}>{tr('Unknown member', 'Anjaan member')}</span>
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
          <div style={{ fontSize: 11, color: color.criticalText, fontFamily: font.body }}>{tr('VOIDED', 'CANCEL')}</div>
        )}
      </Td>
      <Td align="right">
        {!payment.voided && onVoid && (
          <Button variant="quiet" tone="danger" onClick={onVoid}>
            {tr('Void', 'Raseed cancel karo')}
          </Button>
        )}
      </Td>
    </tr>
  );
}

function LedgerCard({ row, onVoid }: { row: LedgerRow; onVoid?: () => void }) {
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
            <span style={{ ...tapTarget, fontSize: 14, color: color.inkMuted }}>{tr('Unknown member', 'Anjaan member')}</span>
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
        <Link to={`/receipts/${payment.id}`} title={tr('Open printable receipt', 'Print wali raseed kholo')}>
          <span style={{ ...tapTarget, fontFamily: font.mono, fontSize: 12, color: color.accentBright }}>
            {payment.receiptNo}
          </span>
        </Link>
        <span style={{ flex: 1 }} />
        {payment.voided ? (
          <span style={{ ...tapTarget, fontSize: 11, color: color.criticalText }}>{tr('VOIDED', 'CANCEL')}</span>
        ) : onVoid ? (
          <Button variant="quiet" tone="danger" onClick={onVoid}>
            {tr('Void', 'Raseed cancel karo')}
          </Button>
        ) : null}
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------- dues

// Owed money is never green: green is this app's "good news" colour, and a debt
// under 30 days old is still a debt. Orange → amber → red as it ages.
const BUCKET_TONE: Record<AgingBucket, 'accent' | 'warn' | 'critical' | 'muted'> = {
  upcoming: 'muted',
  d0_30: 'accent',
  d31_60: 'warn',
  d60plus: 'critical',
};

/** A stat tile has no muted tone — an unfilled bucket simply reads as ordinary. */
function tileTone(bucket: AgingBucket): 'accent' | 'warn' | 'critical' | undefined {
  const tone = BUCKET_TONE[bucket];
  return tone === 'muted' ? undefined : tone;
}

function Dues({ onToast }: { onToast: (msg: string) => void }) {
  const { snapshot, today, viewFor } = useCrm();
  const compact = useIsCompact();
  const [collecting, setCollecting] = useState<MemberView | null>(null);
  const [bucket, setBucket] = useState<AgingBucket | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const seeTotals = useCan()('seeTotals');

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
    // Downloads stay English in every language (an accountant reads them).
    const contents = inEnglish(() => csvDocument(
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
    ));
    downloadCsv(csvFilename([snapshot.gym.name, 'dues', today]), contents);
    onToast(
      shownRows.length === 1
        ? tr(`Exported ${shownRows.length} due.`, `${shownRows.length} baaki fees export hui.`)
        : tr(`Exported ${shownRows.length} dues.`, `${shownRows.length} baaki fees export hui.`),
    );
  };

  const openCollect = (memberId: string) => {
    const view = viewFor(memberId);
    if (!view) {
      setError(
        tr(
          'That member could not be opened. Try reloading the page.',
          'Yeh member khul nahi paaya. Page dobara load karo.',
        ),
      );
      return;
    }
    setError(null);
    setCollecting(view);
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title={tr('Nobody owes anything', 'Kisi ki fees baaki nahi')}
          body={tr('Every membership on the roster is fully paid.', 'Sabhi members ne poori fees di hai.')}
          action={<Button onClick={() => navigate('/members')}>{tr('Open roster', 'Members dekho')}</Button>}
        />
      </Card>
    );
  }

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {seeTotals && (
        <>
        <Grid min={165}>
          <StatTile
            label={tr('Total owed', 'Kul fees baaki')}
            value={formatINRShort(owedP)}
            tone="warn"
            sub={
              people.length === allPeople.length
                ? allPeople.length === 1
                  ? tr(`${allPeople.length} member`, `${allPeople.length} member`)
                  : tr(`${allPeople.length} members`, `${allPeople.length} members`)
                : tr(
                    `${people.length} of ${allPeople.length} members shown`,
                    `${allPeople.length} mein se ${people.length} members dikh rahe`,
                  )
            }
          />
          {totals.map((t) => (
            <StatTile
              key={t.bucket}
              label={agingLabel(t.bucket)}
              value={formatINRShort(t.amountP)}
              tone={t.amountP > 0 ? tileTone(t.bucket) : undefined}
              sub={
                t.countN === 1
                  ? tr(`${t.countN} membership`, `${t.countN} plan`)
                  : tr(`${t.countN} memberships`, `${t.countN} plan`)
              }
            />
          ))}
        </Grid>

        <div style={{ height: space.lg }} />
        </>
      )}

      <Card>
        <SectionTitle
          action={
            seeTotals ? (
              <Button variant="ghost" onClick={exportCsv}>
                {tr('Export CSV', 'CSV nikalo')}
              </Button>
            ) : undefined
          }
        >
          {tr('Who owes', 'Kiski fees baaki')}
        </SectionTitle>

        <ChipToggle
          label={tr('Filter by how old the debt is', 'Kitni purani baaki hai')}
          value={bucket}
          onChange={(v) => setBucket(v as AgingBucket | 'all')}
          options={[
            { value: 'all', label: tr('All', 'Sab'), count: totals.reduce((n, t) => n + t.countN, 0) },
            ...totals.map((t) => ({ value: t.bucket, label: agingLabel(t.bucket), count: t.countN })),
          ]}
        />

        {people.length === 0 ? (
          <EmptyState title={tr('Nothing in this age group', 'Is group mein koi nahi')} />
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
                      {p.terms.length}{' '}
                      {p.terms.length === 1 ? tr('membership', 'plan') : tr('memberships', 'plan')} ·{' '}
                      {ageLabel(p.oldestAgeDays)}
                    </div>
                    <Row gap={space.xs}>
                      <Pill tone={BUCKET_TONE[p.bucket]}>{agingLabel(p.bucket)}</Pill>
                      {p.member.archived && <Pill tone="muted">{tr('Archived', 'Archive kiye')}</Pill>}
                    </Row>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: color.warning }}>
                      {formatINR(p.totalP)}
                    </div>
                    <Button variant="quiet" onClick={() => openCollect(p.member.id)}>
                      {tr('Collect', 'Fees lo')}
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
                  <Th>{tr('Member', 'Member')}</Th>
                  <Th>{tr('Mobile', 'Mobile')}</Th>
                  <Th>{tr('Oldest debt', 'Sabse purani baaki')}</Th>
                  <Th>{tr('Age', 'Kitne din')}</Th>
                  <Th align="right">{tr('Owed', 'Baaki')}</Th>
                  <Th align="right">{tr('Actions', 'Kaam')}</Th>
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
                          <Pill tone="muted">{tr('Archived', 'Archive kiye')}</Pill>
                        </span>
                      )}
                    </Td>
                    <Td mono>{formatPhone(p.member.phone)}</Td>
                    <Td>{ageLabel(p.oldestAgeDays)}</Td>
                    <Td>
                      <Pill tone={BUCKET_TONE[p.bucket]}>{agingLabel(p.bucket)}</Pill>
                    </Td>
                    <Td align="right" mono>
                      <span style={{ color: color.warning, fontWeight: 700 }}>{formatINR(p.totalP)}</span>
                    </Td>
                    <Td align="right">
                      <Button variant="quiet" onClick={() => openCollect(p.member.id)}>
                        {tr('Collect', 'Fees lo')}
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
          onCollected={() => onToast(tr('Payment recorded.', 'Fees le li gayi.'))}
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
  if (ageDays < 0) return tr('Not started yet', 'Abhi shuru nahi hua');
  if (ageDays === 0) return tr('Due today', 'Aaj due');
  return ageDays === 1 ? tr(`${ageDays} day`, `${ageDays} din`) : tr(`${ageDays} days`, `${ageDays} din`);
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
