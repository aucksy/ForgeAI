/**
 * Fresh eyes (14 Nov 2026): one set-up card on Today at a time (logic/setupCards.ts). Each card says whether it wants
 * to show; the provider on Today gives the turn to the first in line. Outside the provider (Settings' full install
 * card, any other page) a card simply shows when it wants to.
 */

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import { setupTurn, type SetupCardId } from '../logic/setupCards';

interface SlotValue {
  turn: SetupCardId | null;
  want: (id: SetupCardId, on: boolean) => void;
}

const SlotContext = createContext<SlotValue | null>(null);

export function SetupSlotProvider({ children }: { children: ReactNode }) {
  const [wants, setWants] = useState<Partial<Record<SetupCardId, boolean>>>({});
  const want = useCallback((id: SetupCardId, on: boolean) => {
    setWants((w) => (w[id] === on ? w : { ...w, [id]: on }));
  }, []);
  const value = useMemo<SlotValue>(() => ({ turn: setupTurn(wants), want }), [wants, want]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/** True when this card may show now: it wants to, and it is its turn (always, outside Today's provider). */
export function useSetupTurn(id: SetupCardId, wants: boolean): boolean {
  const slot = useContext(SlotContext);
  const want = slot?.want;
  // Before paint, so the line-up is settled in the same frame (no card flashes and goes).
  useLayoutEffect(() => {
    if (!want) return undefined;
    want(id, wants);
    return () => want(id, false);
  }, [want, id, wants]);
  if (!slot) return wants;
  return wants && slot.turn === id;
}
