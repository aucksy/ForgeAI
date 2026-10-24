/**
 * Offline front desk, step 3 (owner #7, 18 Oct 2026: "keep the whole CRM working, save changes and
 * sync when the internet is back. Anything that cannot work offline is greyed out/disabled, and a
 * persistent 'Offline mode' banner tells staff only some things work").
 *
 * The banner, the "Waiting to send" mark, and the page shown instead of a page that needs the
 * internet. Every word here went through the member-words pass (24 Oct 2026).
 */
import type { DeskState } from '../data/cloud';
import { formatINR } from '../logic/money';
import { Button, Card, EmptyState, PageHeader, Pill, color, font, space } from './kit';
import { useOffline } from './offlineContext';

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
 */
export function DeskBar({
  state,
  allSent,
  names,
  onSendAgain,
  onDismiss,
}: {
  state: DeskState;
  allSent: boolean;
  /** Member names by id (for the refused items). */
  names: (memberId: string) => string;
  onSendAgain: () => void;
  onDismiss: (noteId: string) => void;
}) {
  const at = new Date(state.savedAt || state.since || Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const showOffline = state.offline;
  const unsentOnline = !state.offline && state.waiting - state.held.length > 0;
  if (!showOffline && !unsentOnline && state.held.length === 0 && state.notes.length === 0 && !allSent) return null;
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
      {unsentOnline && <div>Internet is back. Sending {state.waiting - state.held.length} saved on this device…</div>}
      {allSent && !showOffline && !unsentOnline && <div>All sent. Everything saved on this device is now online.</div>}
      {state.held.map((h) => (
        <div key={h.id} style={{ color: color.warning }}>
          <strong>{names(h.memberId)}:</strong> {h.words}
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
