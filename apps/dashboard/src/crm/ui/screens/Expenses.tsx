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
import { useShop } from '../../shop/ShopProvider';
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
  // C7-14: shop orders handed over this month are money in too (the stock bought for them is Kharcha).
  const { orders } = useShop();
  const summary = useMemo(() => monthSummary(snapshot.payments, expenses, month, orders), [snapshot.payments, expenses, month, orders]);
  const rows = useMemo(() => expensesInMonth(expenses, month), [expenses, month]);
  const byCategory = useMemo(() => totalsByCategory(expenses, month), [expenses, month]);

  const isThisMonth = month === thisMonth;
  const addButton = <Button onClick={() => setAdding(true)}>+ Add expense</Button>;

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="What went out, and what the gym kept"
        actions={addButton}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Month picker: previous / this month / next. */}
      <Card pad={space.sm} style={{ marginBottom: space.lg }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${TOUCH}px minmax(0, 1fr) ${TOUCH}px`, alignItems: 'center', gap: space.sm }}>
          <MonthArrow label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </MonthArrow>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink }}>{monthTitle(month)}</div>
            {isThisMonth ? (
              <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>This month</div>
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
                Back to this month
              </button>
            )}
          </div>
          <MonthArrow label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= thisMonth}>
            ›
          </MonthArrow>
        </div>
      </Card>

      <Grid min={150}>
        {/* Short figures (₹1.2L) so a big month never breaks across lines on a phone; the exact
            amount is on hover and read out by screen readers. */}
        <StatTile
          label="Collected"
          value={formatINRShort(summary.collectedP)}
          fullValue={formatINR(summary.collectedP)}
          tone="good"
          sub={
            summary.shopP > 0
              ? `Fees ${formatINRShort(summary.feesP)} + shop ${formatINRShort(summary.shopP)}`
              : undefined
          }
        />
        <StatTile
          label="Expenses"
          value={formatINRShort(summary.spentP)}
          fullValue={formatINR(summary.spentP)}
          tone={summary.spentP > 0 ? 'warn' : undefined}
        />
        <StatTile
          label="Profit"
          value={formatINRShort(summary.profitP)}
          fullValue={formatINR(summary.profitP)}
          tone={summary.profitP < 0 ? 'critical' : 'accent'}
          sub={summary.profitP < 0 ? 'Spent more than collected' : undefined}
        />
      </Grid>

      <div style={{ height: space.lg }} />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Expenses this month</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState
            title="No expenses this month"
            body="Add rent, salaries, electricity and the rest to see what the gym really kept."
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
          <SectionTitle>By category</SectionTitle>
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
            flash('Expense added.');
          }}
        />
      )}
      {removing && (
        <Sheet
          title="Remove this expense?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Keep it
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  const target = removing;
                  setRemoving(null);
                  setError(null);
                  try {
                    await removeExpense(target.id);
                    flash('Expense removed.');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not remove it. Try again.');
                  }
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            <strong style={{ color: color.ink }}>
              {formatINR(removing.amountP)} · {categoryLabel(removing.category)}
            </strong>{' '}
            ({formatDay(removing.spentOn)})
            {' will be taken out for good. It cannot be brought back — you would have to add it again.'}
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
            ariaLabel={`Remove ${categoryLabel(expense.category)} ${formatINR(expense.amountP)} on ${formatDay(expense.spentOn)}`}
          >
            Remove
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
    if (amountText.trim() === '') return setAmountError('Type how much was spent.');
    const amountP = parseRupeeInput(amountText);
    if (amountP === null) return setAmountError('That isn’t a valid amount.');
    if (amountP <= 0) return setAmountError('Enter an amount greater than zero.');
    if (!isValidDateISO(spentOn)) return setError('Enter the date of this expense.');
    if (spentOn < EARLIEST_DATE) return setError('That date looks like a typo — check the year.');
    if (spentOn > today) return setError('An expense can’t be dated in the future.');

    setSaving(true);
    try {
      await addExpense({ spentOn, amountP, category, note: note.trim() || null, requestId });
      onAdded(spentOn);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Add expense"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save expense'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <TextField
        label="Amount"
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
        label="What for"
        value={category}
        onChange={(v) => setCategory(v as ExpenseCategory)}
        options={categoryOptions()}
      />
      <TextField label="Date" value={spentOn} onChange={setSpentOn} type="date" />
      <TextField
        label="Note (optional)"
        value={note}
        onChange={setNote}
        placeholder="October rent"
      />
    </Sheet>
  );
}
