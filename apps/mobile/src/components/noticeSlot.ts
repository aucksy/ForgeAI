/**
 * Release A, A12 (lib/workoutNotices.ts): the Workout tab draws ONE notice card at a time. Each card
 * still works out whether it has something to say and tells the tab (`onWant`); the tab answers with
 * `hidden` for every card but the one it picked, and hears `onDone` when the member closes a card
 * (Later, Got it), after which the others wait for the next day.
 */
import { useEffect, useRef } from 'react';

export interface NoticeSlotProps {
  /** Another notice is drawn now: keep quiet (still working out `want`). */
  hidden?: boolean;
  /** Whether this card has something to show, each time that changes. */
  onWant?: (want: boolean) => void;
  /** The member closed this card. */
  onDone?: () => void;
}

/** Tell the tab whether this card wants its turn, whenever that changes. */
export function useReportWant(want: boolean, onWant: ((want: boolean) => void) | undefined): void {
  const cb = useRef(onWant);
  cb.current = onWant;
  useEffect(() => {
    cb.current?.(want);
  }, [want]);
}
