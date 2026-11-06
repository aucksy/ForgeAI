/**
 * Billing step 3: one MettleUp receipt (Settings -> Pay MettleUp -> Your receipts -> Open receipt), at
 * /settings/mettleup/receipt/<number>. Owner only (permissions.ts: settings/mettleup). Print-friendly: the
 * "print-sheet" class (index.css) prints only the receipt; "Print or save as PDF" opens the browser's print.
 *
 * Everything on it comes from the server (owner_receipt, 0063): the legal owner's name only when the server's
 * settings row has one (never typed in this public code), and the server's GST line.
 */
import { useEffect, useState } from 'react';

import { useAuth, useRole } from '../../auth/AuthProvider';
import { receiptPeriod, receiptPlanText, type Receipt } from '../../logic/billing';
import { formatINR } from '../../logic/money';
import { payDate } from '../../logic/payMettleUp';
import { PAY_PATH } from '../../logic/trial';
import { billingNotLiveYet, loadReceipt } from '../../shop/billingApi';
import { Button, Card, EmptyState, PageHeader, color, font, space } from '../kit';
import { navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; receipt: Receipt };

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.md, padding: `${space.xs}px 0` }}>
      <span style={{ fontFamily: font.body, fontSize: 14, color: color.inkMuted }}>{label}</span>
      <span style={{ fontFamily: font.body, fontSize: 15, color: color.ink, overflowWrap: 'anywhere', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function MettleUpReceiptScreen({ receiptNo }: { receiptNo: string }) {
  const { session } = useAuth();
  const role = useRole();
  const key = session && session.online && !session.demo && role === 'owner' ? session.ownerKey : '';
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    setLoad({ state: 'loading' });
    if (!key || !receiptNo) {
      setLoad({ state: 'missing' });
      return;
    }
    let live = true;
    loadReceipt(key, receiptNo)
      .then((r) => {
        if (live) setLoad(r ? { state: 'ready', receipt: r } : { state: 'missing' });
      })
      .catch((e: unknown) => {
        if (!billingNotLiveYet(e)) console.warn('[ForgeErr] billing: owner_receipt failed', e);
        if (live) setLoad({ state: 'missing' });
      });
    return () => {
      live = false;
    };
  }, [key, receiptNo]);

  const header = (
    <div className="no-print">
      <PageHeader
        title="Receipt"
        subtitle={receiptNo}
        actions={
          <Button variant="ghost" onClick={() => navigate(PAY_PATH)}>
            Back to Pay MettleUp
          </Button>
        }
      />
    </div>
  );

  if (load.state === 'loading') {
    return (
      <>
        {header}
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>Loading…</p>
      </>
    );
  }
  if (load.state === 'missing') {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="Receipt not found" body="Open it again from Settings, Pay MettleUp, Your receipts." />
        </Card>
      </>
    );
  }

  const r = load.receipt;
  return (
    <>
      {header}
      <div className="print-sheet" data-testid="receipt" style={{ maxWidth: 560 }}>
        <Card>
          <div style={{ display: 'grid', gap: space.xs, marginBottom: space.lg }}>
            <p style={{ margin: 0, fontFamily: font.display, fontSize: 26, fontWeight: 700, color: color.ink }}>{r.business}</p>
            {r.legalName && <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>{r.legalName}</p>}
            {r.address && <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{r.address}</p>}
            <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 16, fontWeight: 700, color: color.ink }}>Receipt</p>
          </div>
          <Line label="Receipt number" value={r.receiptNo} />
          <Line label="Date" value={payDate(r.issuedAt)} />
          <Line label="Gym" value={r.gymCode ? `${r.gymName} (${r.gymCode})` : r.gymName} />
          <Line label="Plan" value={receiptPlanText(r)} />
          <Line label="Period" value={receiptPeriod(r)} />
          <Line label="Amount paid" value={formatINR(r.amountPaise, { showDecimals: true })} />
          <Line label="Paid by" value={r.reference ? `${r.paidVia}, ${r.reference}` : r.paidVia} />
          <p style={{ margin: `${space.lg}px 0 0`, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{r.gstLine}</p>
        </Card>
      </div>
      <div className="no-print" style={{ marginTop: space.lg }}>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
    </>
  );
}
