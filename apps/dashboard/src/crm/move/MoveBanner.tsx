/**
 * The line at the very top of the admin app about MettleUp's new address (R-105; rules in move.ts).
 *  - Old address: says why the page is still here (things waiting, a refused item, sign in first,
 *    records only in this browser), and opens app.mettleup.fit by itself once it is safe. Right
 *    after the page opens it moves at once; when the last waiting item goes while the desk is
 *    working, it waits for a minute without typing, so a half-filled form is never lost.
 *  - New address: once, right after a desk moved, where MettleUp is now.
 * Sits outside every provider, so it shows on the sign-in page too. Checks again every 5 seconds.
 */
import { useEffect, useRef, useState } from 'react';

import { color, font, space } from '../ui/kit';
import { STORAGE_KEY } from '../data/local';
import { readCloudGym } from '../shop/cloudGym';
import {
  MOVED_FLAG,
  MOVED_WORDS,
  OLD_HOST,
  OPEN_NOW,
  READY_WORDS,
  countWaiting,
  goToNewAddress,
  isBrowserOnlyGym,
  moveState,
  moveWords,
  newAddressUp,
  safeRead,
  serverSaysMove,
  type MoveState,
} from './move';

const CHECK_MS = 5_000;
const QUIET_MS = 60_000;

function typing(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
}

function useMove(): { state: MoveState; ready: boolean; openNow: () => void } {
  const [state, setState] = useState<MoveState>({ kind: 'stay' });
  const [ready, setReady] = useState(false);
  const firstCheck = useRef(true);
  const lastInput = useRef(Date.now());
  const openNow = () => goToNewAddress(safeRead);

  useEffect(() => {
    if (window.location.hostname !== OLD_HOST) return;
    let live = true;
    let says: boolean | null = null;
    const onInput = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener('keydown', onInput, true);
    window.addEventListener('pointerdown', onInput, true);
    const check = async () => {
      if (says === null) says = await serverSaysMove();
      if (!says) return;
      const { waiting, held } = await countWaiting();
      const session = readCloudGym();
      const facts = {
        onOldHost: true,
        serverSaysMove: says,
        online: navigator.onLine,
        waiting,
        held,
        signedIn: session !== null,
        browserOnlyGym: isBrowserOnlyGym(safeRead(STORAGE_KEY)),
        newAddressUp: waiting === 0 && held === 0 && navigator.onLine ? await newAddressUp() : false,
      };
      if (!live) return;
      const next = moveState(facts);
      setState(next);
      if (next.kind !== 'go') {
        firstCheck.current = false;
        setReady(false);
        return;
      }
      // Just opened: nothing typed yet, so go now. Later: a quiet minute, and not in a form.
      if (firstCheck.current || (Date.now() - lastInput.current >= QUIET_MS && !typing())) {
        live = false;
        goToNewAddress(safeRead);
        return;
      }
      setReady(true);
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('keydown', onInput, true);
      window.removeEventListener('pointerdown', onInput, true);
    };
  }, []);
  return { state, ready, openNow };
}

function movedHere(): boolean {
  try {
    if (sessionStorage.getItem(MOVED_FLAG) !== '1') return false;
    sessionStorage.removeItem(MOVED_FLAG);
    return true;
  } catch {
    return false;
  }
}

const bar = {
  position: 'relative' as const,
  zIndex: 60,
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  gap: `${space.sm}px ${space.lg}px`,
  padding: `10px ${space.lg}px`,
  background: color.accentSoft,
  borderBottom: `2px solid ${color.accent}`,
  color: color.ink,
  fontFamily: font.body,
  fontSize: 14,
  lineHeight: 1.45,
};

export function MoveBanner() {
  const { state, ready, openNow } = useMove();
  const [justMoved] = useState(movedHere);
  const [closed, setClosed] = useState(false);

  if (justMoved && !closed) {
    return (
      <div role="status" style={bar}>
        <span style={{ flex: '1 1 260px', minWidth: 0 }}>{MOVED_WORDS}</span>
        <button type="button" onClick={() => setClosed(true)} style={linkButton}>
          OK
        </button>
      </div>
    );
  }
  const words = ready ? READY_WORDS : moveWords(state);
  if (!words) return null;
  return (
    <div role="status" style={bar}>
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>{words}</span>
      {ready && (
        <button type="button" onClick={openNow} style={linkButton}>
          {OPEN_NOW}
        </button>
      )}
    </div>
  );
}

const linkButton = {
  border: `1px solid ${color.accent}`,
  background: 'transparent',
  color: color.accentBright,
  borderRadius: 8,
  padding: '6px 12px',
  fontFamily: font.body,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
};
