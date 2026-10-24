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

import { validateE164 } from '../../logic/members';
import { receiptMessage } from '../../logic/whatsapp';
import { whatsAppHref } from '../../shop/invite';
import { useMemo } from 'react';

import { useCrm } from '../../store';
import { formatDay } from '../../logic/dates';
import { formatINR } from '../../logic/money';
import { buildReceiptDoc, type ReceiptDoc } from '../../logic/receiptDoc';
import { Button, Card, EmptyState, PageHeader, color, font, space } from '../kit';
import { useOffline } from '../offlineContext';
import { navigate } from '../router';
import { receiptBackTo } from '../../logic/receiptDoc';

// Every ink reads at 4.5:1 or better on the white paper (test/crm/receiptContrast.test.ts).
// The old faint grey (3.9:1) failed axe on 16 Oct 2026; its text now uses inkSoft.
const PAPER = {
  ink: '#101014',
  inkSoft: '#4A4F5C',
  rule: '#D8DBE2',
  ruleStrong: '#9AA0AC',
  void: '#C0392B',
} as const;

const SERIF = "'Manrope', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function ReceiptScreen({ paymentId }: { paymentId: string }) {
  const { snapshot, today, desk } = useCrm();
  // Review MUST 1: an online save that got no answer: its number is sure only once it is sent.
  const unconfirmed = desk?.unconfirmedIds.includes(paymentId) ?? false;
  const { offline } = useOffline();

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

  const waHref = useMemo(() => {
    const payment = snapshot.payments.find((p) => p.id === paymentId);
    const member = payment ? snapshot.members.find((m) => m.id === payment.memberId) : undefined;
    if (!payment || !member || payment.voided || !validateE164(member.phone)) return null;
    return whatsAppHref(receiptMessage(payment, member.fullName, snapshot.gym), member.phone);
  }, [snapshot, paymentId]);

  if (!doc) {
    return (
      <Card>
        <EmptyState
          title="Receipt not found"
          body="This receipt is not here any more. It may be from a gym you erased."
          action={<Button onClick={() => navigate('/money')}>Back to Money</Button>}
        />
      </Card>
    );
  }

  return (
    // One centred column the width of the paper, so Back and Print sit on the
    // receipt's own right edge instead of 400px away across empty page.
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="no-print">
        <PageHeader
          title={`Receipt ${doc.receiptNo}`}
          subtitle={`${doc.memberName} · ${doc.paidOnLabel}`}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => (receiptBackTo(window.history.length) === 'back' ? window.history.back() : navigate('/money'))}
              >
                Back
              </Button>
              {/* Step 4: the receipt as a WhatsApp message to the member (the print stays the record). */}
              {waHref && !offline && (
                <a href={waHref} target="_blank" rel="noreferrer" style={waLink}>
                  Send on WhatsApp
                </a>
              )}
              <Button disabled={unconfirmed} onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        />
        {unconfirmed && (
          <p role="note" style={{ margin: `0 0 ${space.lg}px`, fontFamily: font.body, fontSize: 14, color: color.warning }}>
            Not confirmed yet: the internet dropped while this was saved. Its receipt number is sure once it is sent, so print it after that.
          </p>
        )}
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
    </div>
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
      CANCELLED — THIS RECEIPT DOES NOT COUNT
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
        {doc.taxInvoice && (
          <div style={{ color: PAPER.inkSoft, fontSize: 13, marginTop: 2 }}>
            {doc.taxInvoice.placeOfSupply ? `Place of supply: ${doc.taxInvoice.placeOfSupply} · ` : ''}
            Reverse charge: {doc.taxInvoice.reverseCharge}
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

        {doc.collectedByName && (
          <div>
            <span style={{ color: PAPER.inkSoft }}>Received by</span> {doc.collectedByName}
          </div>
        )}

        {doc.balanceP !== null && doc.termTotalP !== null && (
          <div>
            <span style={{ color: PAPER.inkSoft }}>
              Balance on this membership as on {formatDay(doc.balanceAsOn)}:
            </span>{' '}
            <strong style={{ fontFamily: MONO }}>{formatINR(doc.balanceP)}</strong>
            <span style={{ color: PAPER.inkSoft }}> of {formatINR(doc.termTotalP)}</span>
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
        <div style={{ color: PAPER.inkSoft, fontSize: 11, maxWidth: 320 }}>
          {doc.taxInvoice ? 'Computer-generated tax invoice.' : 'Computer-generated receipt. Valid without a signature.'}
        </div>
        <div style={{ textAlign: 'right', minWidth: 200 }}>
          {/* A tax invoice carries the supplier's signature (rule 46): room to sign or stamp above the line. */}
          <div style={{ borderTop: `1px solid ${PAPER.rule}`, paddingTop: 6, fontSize: 13, marginTop: doc.taxInvoice ? 28 : 0 }}>
            For {doc.gymName}
          </div>
          {doc.taxInvoice && <div style={{ color: PAPER.inkSoft, fontSize: 12 }}>Authorised signatory</div>}
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

const waLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 18px',
  borderRadius: 999,
  background: '#25D366',
  color: '#06280F',
  fontWeight: 800,
  fontSize: 14,
  textDecoration: 'none',
};
