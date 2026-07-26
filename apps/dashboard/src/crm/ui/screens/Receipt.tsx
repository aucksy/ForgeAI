/**
 * A printable receipt.
 *
 * Rendered as a white sheet of paper even on screen, so what the owner sees is
 * what comes out of the printer — and so the dark theme never has to be unpicked
 * colour by colour at print time, which is how printed pages usually end up
 * unreadable. Everything the sheet says is assembled by the pure
 * `logic/receiptDoc.ts`; this file only lays it out.
 *
 * Colours here are hard-coded rather than taken from the theme on purpose: the
 * theme is a dark-UI palette, and this is paper.
 */

import { useMemo } from 'react';

import { useCrm } from '../../store';
import { formatDay } from '../../logic/dates';
import { formatINR } from '../../logic/money';
import { buildReceiptDoc, type ReceiptDoc } from '../../logic/receiptDoc';
import { Button, Card, EmptyState, PageHeader, space } from '../kit';
import { navigate } from '../router';

const PAPER = {
  ink: '#101014',
  inkSoft: '#4A4F5C',
  inkFaint: '#7C818E',
  rule: '#D8DBE2',
  ruleStrong: '#9AA0AC',
  void: '#C0392B',
} as const;

const SERIF = "'Manrope', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function ReceiptScreen({ paymentId }: { paymentId: string }) {
  const { snapshot, today } = useCrm();

  const doc = useMemo<ReceiptDoc | null>(() => {
    const payment = snapshot.payments.find((p) => p.id === paymentId);
    if (!payment) return null;

    return buildReceiptDoc({
      gym: snapshot.gym,
      payment,
      member: snapshot.members.find((m) => m.id === payment.memberId) ?? null,
      membership: payment.membershipId
        ? (snapshot.memberships.find((m) => m.id === payment.membershipId) ?? null)
        : null,
      memberPayments: snapshot.payments.filter((p) => p.memberId === payment.memberId),
      today,
    });
  }, [snapshot, paymentId, today]);

  if (!doc) {
    return (
      <Card>
        <EmptyState
          title="Receipt not found"
          body="This receipt no longer exists. It may have been on a gym you have since erased."
          action={<Button onClick={() => navigate('/money')}>Back to money</Button>}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Receipt ${doc.receiptNo}`}
          subtitle={`${doc.memberName} · ${doc.paidOnLabel}`}
          actions={
            <>
              <Button variant="ghost" onClick={() => window.history.back()}>
                Back
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
            </>
          }
        />
      </div>

      <div
        className="print-sheet"
        style={{
          maxWidth: 720,
          padding: 32,
          fontFamily: SERIF,
          color: PAPER.ink,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {doc.voided && <VoidBanner reason={doc.voidReason} />}

        <Letterhead doc={doc} />

        <div style={{ marginTop: 24, color: PAPER.inkSoft, fontSize: 13 }}>Received with thanks from</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{doc.memberName}</div>
        {doc.memberPhone && (
          <div style={{ color: PAPER.inkSoft, fontSize: 13, fontFamily: MONO }}>{doc.memberPhone}</div>
        )}

        <Particulars doc={doc} />

        <div
          style={{
            marginTop: 6,
            paddingTop: 10,
            borderTop: `2px solid ${PAPER.ruleStrong}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 16,
          }}
        >
          <strong style={{ fontSize: 15 }}>Total received</strong>
          <strong style={{ fontSize: 20, fontFamily: MONO }}>{formatINR(doc.amountP)}</strong>
        </div>
        <div style={{ marginTop: 4, fontSize: 13, fontStyle: 'italic', color: PAPER.inkSoft }}>
          {doc.amountWords}
        </div>

        <TaxBreakup doc={doc} />

        <Footer doc={doc} />
      </div>
    </>
  );
}

function VoidBanner({ reason }: { reason: string | null }) {
  return (
    <div
      className="print-exact"
      role="alert"
      style={{
        border: `2px solid ${PAPER.void}`,
        color: PAPER.void,
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 20,
        fontWeight: 800,
        letterSpacing: 1,
        textAlign: 'center',
      }}
    >
      {/* Text, not just a colour: a receipt that prints in mono on a cheap desk
          printer must still say it is void. */}
      VOID — THIS RECEIPT HAS BEEN CANCELLED
      {reason ? (
        <div style={{ fontWeight: 500, letterSpacing: 0, fontSize: 13, marginTop: 2 }}>{reason}</div>
      ) : null}
    </div>
  );
}

function Letterhead({ doc }: { doc: ReceiptDoc }) {
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: `2px solid ${PAPER.ruleStrong}`,
        paddingBottom: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2 }}>{doc.gymName}</div>
        {doc.gymAddress && (
          <div style={{ color: PAPER.inkSoft, fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 320 }}>
            {doc.gymAddress}
          </div>
        )}
        {doc.gymPhone && (
          <div style={{ color: PAPER.inkSoft, fontSize: 13, fontFamily: MONO }}>{doc.gymPhone}</div>
        )}
        {doc.gstin && (
          <div style={{ color: PAPER.ink, fontSize: 13, fontFamily: MONO, marginTop: 4 }}>
            GSTIN: {doc.gstin}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, letterSpacing: 1.4, color: PAPER.inkSoft, textTransform: 'uppercase' }}>
          {doc.heading}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, marginTop: 2 }}>
          {doc.receiptNo}
        </div>
        <div style={{ color: PAPER.inkSoft, fontSize: 13 }}>{doc.paidOnLabel}</div>
      </div>
    </header>
  );
}

function Particulars({ doc }: { doc: ReceiptDoc }) {
  return (
    <table style={{ marginTop: 20, width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <Th align="left">Particulars</Th>
          <Th align="right">Amount</Th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td>
            <div style={{ fontWeight: 700 }}>{doc.particulars}</div>
            {doc.particularLines.map((line) => (
              <div key={line} style={{ color: PAPER.inkSoft, fontSize: 13 }}>
                {line}
              </div>
            ))}
          </Td>
          <Td align="right" mono>
            {formatINR(doc.amountP)}
          </Td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The tax breakup sits BELOW the total, in its own boxed block, not as extra rows
 * in the Amount column.
 *
 * The numbers are the same either way — taxable + CGST + SGST is exactly the
 * amount received — but stacked in one column with the gross above them, reading
 * down the column gives ₹3,000 against a ₹1,500 total. On a document that leaves
 * the building, a layout that invites the misreading is the same defect as the
 * misreading itself.
 */
function TaxBreakup({ doc }: { doc: ReceiptDoc }) {
  if (!doc.gst) return null;
  const half = doc.gst.ratePct / 2;

  return (
    <div
      style={{
        marginTop: 16,
        border: `1px solid ${PAPER.rule}`,
        borderRadius: 6,
        padding: '10px 14px',
        maxWidth: 340,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: PAPER.inkSoft,
          marginBottom: 6,
        }}
      >
        Tax included in the above
        {doc.sacCode ? ` · SAC ${doc.sacCode}` : ''}
      </div>
      <TaxLine label="Taxable value" amountP={doc.gst.taxableP} />
      <TaxLine label={`CGST @ ${half}%`} amountP={doc.gst.cgstP} />
      <TaxLine label={`SGST @ ${half}%`} amountP={doc.gst.sgstP} />
    </div>
  );
}

function TaxLine({ label, amountP }: { label: string; amountP: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
      <span style={{ color: PAPER.inkSoft }}>{label}</span>
      <span style={{ fontFamily: MONO }}>{formatINR(amountP, { showDecimals: true })}</span>
    </div>
  );
}

function Footer({ doc }: { doc: ReceiptDoc }) {
  return (
    <>
      <div style={{ marginTop: 18, fontSize: 13, display: 'grid', gap: 3 }}>
        <div>
          <span style={{ color: PAPER.inkSoft }}>Paid by</span> {doc.method}
          {doc.reference ? (
            <>
              <span style={{ color: PAPER.inkSoft }}> · Ref</span>{' '}
              <span style={{ fontFamily: MONO }}>{doc.reference}</span>
            </>
          ) : null}
        </div>

        {doc.balanceP !== null && doc.termTotalP !== null && (
          <div>
            <span style={{ color: PAPER.inkSoft }}>
              Balance on this membership as on {formatDay(doc.balanceAsOn)}:
            </span>{' '}
            <strong style={{ fontFamily: MONO }}>{formatINR(doc.balanceP)}</strong>
            <span style={{ color: PAPER.inkFaint }}> of {formatINR(doc.termTotalP)}</span>
          </div>
        )}

        {doc.taxNote && <div style={{ color: PAPER.inkSoft }}>{doc.taxNote}</div>}
      </div>

      <div
        style={{
          marginTop: 36,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ color: PAPER.inkFaint, fontSize: 11, maxWidth: 320 }}>
          Computer-generated receipt. Valid without a signature.
        </div>
        <div style={{ textAlign: 'right', minWidth: 200 }}>
          <div style={{ borderTop: `1px solid ${PAPER.rule}`, paddingTop: 6, fontSize: 13 }}>
            For {doc.gymName}
          </div>
        </div>
      </div>
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: PAPER.inkSoft,
        fontWeight: 600,
        borderBottom: `1px solid ${PAPER.rule}`,
        padding: '0 0 6px',
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
        padding: `${space.sm}px 0`,
        borderBottom: `1px solid ${PAPER.rule}`,
        verticalAlign: 'top',
        fontFamily: mono ? MONO : undefined,
        whiteSpace: mono ? 'nowrap' : undefined,
      }}
    >
      {children}
    </td>
  );
}
