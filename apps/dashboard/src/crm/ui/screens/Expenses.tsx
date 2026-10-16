/**
 * Kharcha — what the gym spent, month by month, and what it kept.
 *
 * Three numbers lead: Collection (receipts that still stand), Kharcha, and Munafa (the
 * difference, red when the month lost money). Below them, the month's expenses newest first and
 * the category totals. Removing an expense is the only destructive control here, so it asks
 * first and says plainly that it cannot be brought back.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCan } from '../../auth/AuthProvider';
import { useCrm } from '../../store';
import { tr } from '../../i18n';
import { formatDay, isValidDateISO, monthKey } from '../../logic/dates';
import {
  categoryLabel,
  categoryOptions,
  expensesInMonth,
  monthSummary,
  monthTitle,
  shiftMonth,
  totalsByCategory,
} from '../../logic/expenses';
import { formatINR, formatINRShort, parseRupeeInput } from '../../logic/money';
import { EARLIEST_DATE } from '../../data/adapter';
import { newRequestId } from '../../data/local';
import type { Expense, ExpenseCategory } from '../../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Row,
  SectionTitle,
  SelectField,
  Sheet,
  StatTile,
  TextField,
  Toast,
  color,
  font,
  radius,
  space,
  TOUCH,
} from '../kit';

export function ExpensesScreen() {
  const { snapshot, today, removeExpense } = useCrm();
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(thisMonth);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Expense | null>(null);
  // The route itself is owner-only (CrmApp + permissions.ts); this keeps Remove tied to its own rule too.
  const canRemove = useCan()('removeExpense');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const expenses = snapshot.expenses ?? [];
  const summary = useMemo(() => monthSummary(snapshot.payments, expenses, month), [snapshot.payments, expenses, month]);
  const rows = useMemo(() => expensesInMonth(expenses, month), [expenses, month]);
  const byCategory = useMemo(() => totalsByCategory(expenses, month), [expenses, month]);

  const isThisMonth = month === thisMonth;
  const addButton = <Button onClick={() => setAdding(true)}>{tr('+ Add expense', '+ Kharcha jodo')}</Button>;

  return (
    <>
      <PageHeader
        title={tr('Expenses', 'Kharcha')}
        subtitle={tr('What went out, and what the gym kept', 'Kitna kharcha hua, kitna munafa bacha')}
        actions={addButton}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Month picker: previous / this month / next. */}
      <Card pad={space.sm} style={{ marginBottom: space.lg }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${TOUCH}px minmax(0, 1fr) ${TOUCH}px`, alignItems: 'center', gap: space.sm }}>
          <MonthArrow label={tr('Previous month', 'Pichhla mahina')} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </MonthArrow>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink }}>{monthTitle(month)}</div>
            {isThisMonth ? (
              <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{tr('This month', 'Is mahine')}</div>
            ) : (
              <button
                type="button"
                onClick={() => setMonth(thisMonth)}
                style={{
                  appearance: 'none',
                  background: 'none',
                  border: 'none',
                  color: color.accentBright,
                  fontFamily: font.body,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: TOUCH,
                  padding: '0 12px',
                }}
              >
                {tr('Back to this month', 'Is mahine par jao')}
              </button>
            )}
          </div>
          <MonthArrow label={tr('Next month', 'Agla mahina')} onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= thisMonth}>
            ›
          </MonthArrow>
        </div>
      </Card>

      <Grid min={150}>
        {/* Short figures (₹1.2L) so a big month never breaks across lines on a phone; the exact
            amount is on hover and read out by screen readers. */}
        <StatTile
          label={tr('Collected', 'Collection')}
          value={formatINRShort(summary.collectedP)}
          fullValue={formatINR(summary.collectedP)}
          tone="good"
        />
        <StatTile
          label={tr('Expenses', 'Kharcha')}
          value={formatINRShort(summary.spentP)}
          fullValue={formatINR(summary.spentP)}
          tone={summary.spentP > 0 ? 'warn' : undefined}
        />
        <StatTile
          label={tr('Profit', 'Munafa')}
          value={formatINRShort(summary.profitP)}
          fullValue={formatINR(summary.profitP)}
          tone={summary.profitP < 0 ? 'critical' : 'accent'}
          sub={summary.profitP < 0 ? tr('Spent more than collected', 'Collection se zyada kharcha hua') : undefined}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Expenses this month', 'Is mahine ka kharcha')}</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState
            title={tr('No expenses this month', 'Is mahine koi kharcha nahi likha')}
            body={tr(
              'Add rent, salaries, electricity and the rest to see what the gym really kept.',
              'Kiraya, tankhwah, bijli sab jodo, tab asli munafa dikhega.',
            )}
            action={addButton}
          />
        ) : (
          <div style={{ display: 'grid' }}>
            {rows.map((e, i) => (
              <ExpenseRow key={e.id} expense={e} first={i === 0} onRemove={canRemove ? () => setRemoving(e) : undefined} />
            ))}
          </div>
        )}
      </Card>

      {byCategory.length > 0 && (
        <Card>
          <SectionTitle>{tr('By category', 'Kis cheez par kitna')}</SectionTitle>
          <div style={{ display: 'grid', gap: space.sm }}>
            {byCategory.map((c) => (
              <div key={c.category}>
                <Row gap={space.sm} wrap={false}>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, color: color.ink }}>
                    {categoryLabel(c.category)}
                    <span style={{ color: color.inkMuted, fontSize: 12 }}> · {c.count}</span>
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: color.ink }}>{formatINR(c.totalP)}</span>
                </Row>
                <div style={{ height: 6, borderRadius: radius.pill, background: color.surfaceSunken, marginTop: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${summary.spentP > 0 ? Math.max(2, Math.round((c.totalP / summary.spentP) * 100)) : 0}%`,
                      background: color.accent,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {adding && (
        <AddExpenseSheet
          onClose={() => setAdding(false)}
          onAdded={(spentOn) => {
            setMonth(monthKey(spentOn));
            flash(tr('Expense added.', 'Kharcha jud gaya.'));
          }}
        />
      )}
      {removing && (
        <Sheet
          title={tr('Remove this expense?', 'Yeh kharcha hatayein?')}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                {tr('Keep it', 'Rehne do')}
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  const target = removing;
                  setRemoving(null);
                  setError(null);
                  try {
                    await removeExpense(target.id);
                    flash(tr('Expense removed.', 'Kharcha hata diya.'));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : tr('Could not remove it. Try again.', 'Hata nahi paaye. Phir se try karo.'));
                  }
                }}
              >
                {tr('Remove', 'Hatao')}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            <strong style={{ color: color.ink }}>
              {formatINR(removing.amountP)} · {categoryLabel(removing.category)}
            </strong>{' '}
            ({formatDay(removing.spentOn)})
            {tr(
              ' will be taken out for good. It cannot be brought back — you would have to add it again.',
              ' hamesha ke liye hat jayega. Wapas nahi aayega — dobara jodna padega.',
            )}
          </p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function MonthArrow({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        width: TOUCH,
        height: TOUCH,
        borderRadius: radius.pill,
        border: `1px solid ${color.borderStrong}`,
        background: 'transparent',
        color: color.ink,
        fontSize: 22,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ExpenseRow({ expense, first, onRemove }: { expense: Expense; first: boolean; onRemove?: () => void }) {
  return (
    <div style={{ borderTop: first ? undefined : `1px solid ${color.border}`, padding: `${space.sm}px 0` }}>
      <Row gap={space.sm} wrap={false}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{categoryLabel(expense.category)}</div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginTop: 2, overflowWrap: 'anywhere' }}>
            {formatDay(expense.spentOn)}
            {expense.note ? ` · ${expense.note}` : ''}
          </div>
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
          {formatINR(expense.amountP)}
        </span>
        {onRemove && (
          <Button
            variant="quiet"
            tone="danger"
            onClick={onRemove}
            ariaLabel={tr(
              `Remove ${categoryLabel(expense.category)} ${formatINR(expense.amountP)} on ${formatDay(expense.spentOn)}`,
              `${formatDay(expense.spentOn)} ka ${categoryLabel(expense.category)} ${formatINR(expense.amountP)} hatao`,
            )}
          >
            {tr('Remove', 'Hatao')}
          </Button>
        )}
      </Row>
    </div>
  );
}

function AddExpenseSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (spentOn: string) => void }) {
  const { today, addExpense } = useCrm();
  const [spentOn, setSpentOn] = useState(today);
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // C7-1: one id for this sheet's save, so a second press after "no internet" saves once.
  const [requestId] = useState(newRequestId);

  const submit = async () => {
    setError(null);
    setAmountError(null);
    if (amountText.trim() === '') return setAmountError(tr('Type how much was spent.', 'Kitna kharcha hua, likho.'));
    const amountP = parseRupeeInput(amountText);
    if (amountP === null) return setAmountError(tr('That isn’t a valid amount.', 'Yeh sahi rakam nahi hai.'));
    if (amountP <= 0) return setAmountError(tr('Enter an amount greater than zero.', 'Zero se zyada rakam likho.'));
    if (!isValidDateISO(spentOn)) return setError(tr('Enter the date of this expense.', 'Kharche ki tareekh likho.'));
    if (spentOn < EARLIEST_DATE) return setError(tr('That date looks like a typo — check the year.', 'Tareekh galat lag rahi hai — saal check karo.'));
    if (spentOn > today) return setError(tr('An expense can’t be dated in the future.', 'Aage ki tareekh ka kharcha nahi likh sakte.'));

    setSaving(true);
    try {
      await addExpense({ spentOn, amountP, category, note: note.trim() || null, requestId });
      onAdded(spentOn);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Could not save this expense.', 'Yeh kharcha save nahi hua.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={tr('Add expense', 'Kharcha jodo')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? tr('Saving…', 'Save ho raha hai…') : tr('Save expense', 'Kharcha save karo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField
        label={tr('Amount', 'Kitne rupaye')}
        value={amountText}
        onChange={(v) => {
          setAmountText(v);
          setAmountError(null);
        }}
        prefix="₹"
        inputMode="decimal"
        placeholder="5,000"
        autoFocus
        error={amountError}
      />
      <SelectField
        label={tr('What for', 'Kis cheez ka')}
        value={category}
        onChange={(v) => setCategory(v as ExpenseCategory)}
        options={categoryOptions()}
      />
      <TextField label={tr('Date', 'Tareekh')} value={spentOn} onChange={setSpentOn} type="date" />
      <TextField
        label={tr('Note (optional)', 'Note (zaroori nahi)')}
        value={note}
        onChange={setNote}
        placeholder={tr('October rent', 'October ka kiraya')}
      />
    </Sheet>
  );
}
