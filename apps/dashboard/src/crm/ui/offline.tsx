/**
 * Offline front desk, step 3 (owner #7, 18 Oct 2026: "keep the whole CRM working, save changes and
 * sync when the internet is back. Anything that cannot work offline is greyed out/disabled, and a
 * persistent 'Offline mode' banner tells staff only some things work").
 *
 * The banner, the "Waiting to send" mark, and the page shown instead of a page that needs the
 * internet. Every word here went through the member-words pass (24 Oct 2026).
 */
import { useState } from 'react';

import { useRole } from '../auth/AuthProvider';
import type { DeskState } from '../data/cloud';
import { formatINR } from '../logic/money';
import { Button, Card, EmptyState, PageHeader, Pill, color, font, space } from './kit';
import { useOffline } from './offlineContext';
import { useCrm } from '../store';

/** "3 waiting to send" (things, not only payments). */
export function waitingWords(n: number): string {
  return `${n} waiting to send`;
}

/** Beside a receipt, member or check-in made on this device and not on the server yet. */
export function WaitingPill({ id }: { id: string }) {
  const { waitingIds } = useOffline();
  if (!waitingIds.has(id)) return null;
  return <Pill tone="warn">Waiting to send</Pill>;
}

/**
 * The bar at the top of every page: while offline (what still works, how many wait), while things
 * wait or were refused, a moment after everything went ("All sent"), and the notes from sending.
 * Review SHOULD 3: a refused receipt shows here only (never in the totals); the owner saves it as a
 * cancelled receipt or removes it from this device (after a confirm).
 */
export function DeskBar({
  state,
  allSent,
  names,
  onSendAgain,
  onDismiss,
  onAction,
}: {
  state: DeskState;
  allSent: boolean;
  /** Member names by id (for the refused items). */
  names: (memberId: string) => string;
  onSendAgain: () => void;
  onDismiss: (noteId: string) => void;
  onAction: (kind: 'cancelled' | 'remove' | 'today', id: string) => Promise<void>;
}) {
  const owner = useRole() === 'owner';
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const act = (kind: 'cancelled' | 'remove' | 'today', id: string) => {
    setFailed(null);
    setConfirming(null);
    onAction(kind, id).catch((e: unknown) => {
      console.warn('[offline desk] owner action', kind, e);
      setFailed(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    });
  };
  const at = new Date(state.savedAt || state.since || Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const showOffline = state.offline;
  const sending = state.waiting - state.held.length - state.waits.length;
  const unsentOnline = !state.offline && sending > 0;
  if (!showOffline && !unsentOnline && state.held.length === 0 && state.waits.length === 0 && state.notes.length === 0 && !allSent) return null;
  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: color.surfaceSunken,
        color: color.ink,
        borderBottom: `2px solid ${showOffline || state.held.length > 0 ? color.warning : color.border}`,
        padding: '8px 16px',
        fontSize: 14,
        lineHeight: 1.4,
        fontFamily: font.body,
        display: 'grid',
        gap: 6,
      }}
    >
      {showOffline && (
        <div>
          <strong>Offline mode.</strong> No internet. Check-ins, payments and new members are saved on this device and sent
          when the internet is back. Other things wait. Details shown are from {at}.
          {state.waiting > 0 ? ` ${waitingWords(state.waiting)}.` : ''}
        </div>
      )}
      {showOffline && !state.canPayOffline && (
        <div>Connect this device to the internet once so it can take payments offline.</div>
      )}
      {unsentOnline && <div>Internet is back. Sending {sending} saved on this device…</div>}
      {allSent && !showOffline && !unsentOnline && <div>All sent. Everything saved on this device is now online.</div>}
      {failed && <div role="alert" style={{ color: color.criticalText }}>{failed}</div>}
      {state.waits.map((w) => (
        <div key={w.id} style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>
            <strong>{names(w.memberId)}:</strong> {w.words}
          </span>
          {w.clockAhead && owner && (
            <Button variant="ghost" onClick={() => act('today', w.id)}>
              Send with today's date
            </Button>
          )}
        </div>
      ))}
      {state.held.map((h) => (
        <div key={h.id} style={{ display: 'grid', gap: 4 }}>
          <span style={{ color: color.warning }}>
            <strong>{names(h.memberId)}:</strong> {h.words}
            {h.withIt > 0 ? ` ${h.withIt === 1 ? '1 more thing' : `${h.withIt} more things`} for this member wait with it.` : ''}
          </span>
          {owner && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
              {h.hasReceipt && (
                <Button variant="ghost" onClick={() => act('cancelled', h.id)}>
                  Save as cancelled receipt
                </Button>
              )}
              {confirming === h.id ? (
                <>
                  <span>Remove it from this device for good? It was never sent, so it will be gone.</span>
                  <Button variant="ghost" tone="danger" onClick={() => act('remove', h.id)}>
                    Yes, remove it
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirming(null)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button variant="quiet" tone="danger" onClick={() => setConfirming(h.id)}>
                  Remove from this device
                </Button>
              )}
            </span>
          )}
        </div>
      ))}
      {state.held.length > 0 && !showOffline && (
        <div>
          <Button variant="ghost" onClick={onSendAgain}>
            Try sending again
          </Button>
        </div>
      )}
      {state.notes.map((n) => (
        <div key={n.id} style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>{n.text}</span>
          <Button variant="quiet" onClick={() => onDismiss(n.id)} ariaLabel={`OK, hide: ${n.text}`}>
            OK
          </Button>
        </div>
      ))}
    </div>
  );
}
/** Instead of a page that cannot work offline (messages, staff, branches, import, settings pages). */
export function NeedsInternetPage({ what }: { what: string }) {
  return (
    <>
      <PageHeader title={what} />
      <Card>
        <EmptyState
          title={`${what} needs the internet`}
          body="This page opens when the internet is back. Open Members to save check-ins, payments and new members now."
        />
      </Card>
    </>
  );
}

/** On Today: money taken on this device while offline that is not on the server yet. */
export function WaitingMoneyLine({ state }: { state: DeskState | null }) {
  if (!state || state.payments === 0) return null;
  return (
    <div style={{ fontFamily: font.body, fontSize: 13, color: color.warning, marginBottom: space.md }}>
      {formatINR(state.paidP)} in {state.payments === 1 ? '1 payment' : `${state.payments} payments`} taken on this device is waiting to send.
    </div>
  );
}

/**
 * Review nit, owner only (Settings -> Your data): "Clear this device's saved data": the copy of the
 * gym kept for offline use and anything still waiting to be sent. Nothing waiting: one confirm.
 * Something waiting: the confirm lists it, and says it will never reach the gym's records.
 */
export function ClearDeviceCard() {
  const { desk, deskAction } = useCrm();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (!desk) return null;
  const n = desk.waiting;
  const clear = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await deskAction('clear');
      setDone(true);
      setAsking(false);
    } catch (e) {
      console.warn('[offline desk] clear this device', e);
      setFailed(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'grid', gap: space.sm, fontFamily: font.body, fontSize: 14 }}>
      {done && <div role="status">This device's saved data is cleared. Everything saved online for your gym stays as it is.</div>}
      {failed && <div role="alert" style={{ color: color.criticalText }}>{failed}</div>}
      {!asking ? (
        <span>
          <Button variant="ghost" tone="danger" needsInternet={n > 0} onClick={() => setAsking(true)}>
            Clear this device's saved data
          </Button>
        </span>
      ) : (
        <div role="group" aria-label="Clear this device's saved data?" style={{ display: 'grid', gap: space.sm }}>
          <span>
            {n === 0
              ? "This removes the copy of your gym kept on this device for use without internet. Everything saved online for your gym stays as it is."
              : `${waitingWords(n)} on this device${desk.payments > 0 ? `, including ${desk.payments === 1 ? '1 payment' : `${desk.payments} payments`} of ${formatINR(desk.paidP)}` : ''}. Clearing deletes ${n === 1 ? 'it' : 'them'} for good: ${n === 1 ? 'it will' : 'they will'} never reach your gym online.`}
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            <Button tone="danger" disabled={busy} onClick={() => void clear()}>
              {n === 0 ? 'Clear it' : `Delete ${n === 1 ? 'it' : `all ${n}`} and clear`}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}