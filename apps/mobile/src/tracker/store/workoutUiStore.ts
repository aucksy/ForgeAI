/**
 * Short-lived signals between parts of the workout screen (Phase 1). Not persisted.
 *  - `record`: the "New record" toast — set when a ticked set beats the member's
 *    history, cleared by the toast after a few seconds.
 *  - `scrollTo`: superset hand-off — the exercise the screen should bring into view.
 *  - `rowNote` (Phase 6): a rest card's "Done" could not tick this row — the row says what is
 *    missing ("Add reps first") and puts the cursor there, as a tick on screen would.
 *  - `lastTime`: the quiet "+2.5 kg on last time" line after a tick that was not a record. It
 *    shares the record toast's place; a record always replaces it.
 *  - `entryFocus`: which set box has the cursor, so the entry bar above the keyboard knows
 *    which set its steps and "Copy to sets below" act on.
 */
import { create } from 'zustand';

import type { EntryField } from '../services/setEntry';
import type { TickMissing } from '../services/setTick';

export interface EntryFocus {
  exKey: string;
  setKey: string;
  field: EntryField;
}

export interface WorkoutUiState {
  /** `lines`: one per record the set beat (15 Oct 2026); absent = the single `label`. */
  record: { id: number; exercise: string; label: string; lines?: { kind: string; title: string; value: string }[] } | null;
  scrollTo: { id: number; exKey: string } | null;
  rowNote: { id: number; exKey: string; setKey: string; missing: TickMissing } | null;
  /** 17 Oct 2026 (owner): a set the RPE sheet just ticked — its ✓ pops so the member sees it. */
  tickPop: { id: number; exKey: string; setKey: string } | null;
  lastTime: { id: number; exercise: string; text: string } | null;
  /**
   * C1-14 (16 Oct 2026 audit): the D7 typo question for one row ("300 kg — that's 4× your best.
   * Keep it?"), asked after EVERY tick path (✓, RPE sheet, rest card's Done); the row shows it.
   */
  typoAsk: { id: number; exKey: string; setKey: string; text: string; kind: 'weight' | 'reps' } | null;
  entryFocus: EntryFocus | null;
  /** True while the workout screen is mounted — a notification tap must not push a second copy. */
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
  showRecord: (exercise: string, label: string, lines?: { kind: string; title: string; value: string }[]) => void;
  clearRecord: (id: number) => void;
  requestScroll: (exKey: string) => void;
  showRowNote: (exKey: string, setKey: string, missing: TickMissing) => void;
  popTick: (exKey: string, setKey: string) => void;
  showLastTime: (exercise: string, text: string) => void;
  clearLastTime: (id: number) => void;
  askTypo: (exKey: string, setKey: string, text: string, kind: 'weight' | 'reps') => void;
  /** The question is answered (or its row unticked): it goes. */
  clearTypo: (exKey: string, setKey: string) => void;
  focusEntry: (f: EntryFocus) => void;
  /** Leaves only when it still names this box (or, without `field`, any box of this set). */
  blurEntry: (exKey: string, setKey: string, field?: EntryField) => void;
}

let seq = 0;
/**
 * How many workout screens are mounted. Normally 0 or 1; counted (not a flag) so that if a
 * second copy ever mounts, closing one does not mark the screen as gone while the other stays.
 */
let mounted = 0;

export const useWorkoutUi = create<WorkoutUiState>()((set, get) => ({
  record: null,
  scrollTo: null,
  rowNote: null,
  tickPop: null,
  lastTime: null,
  typoAsk: null,
  entryFocus: null,
  screenOpen: false,
  setScreenOpen: (open) => {
    // The flag may have been set directly (tests): count from what it says.
    if (!get().screenOpen) mounted = 0;
    else if (mounted === 0) mounted = 1;
    mounted = Math.max(0, mounted + (open ? 1 : -1));
    // 16 Oct 2026 audit (C1-5): the workout screen going away (minimised, finished, discarded)
    // takes its pop-ups with it. Their clearing timers die with the screen, so a "New record"
    // left here played again — confetti and all — when the screen next opened, even days later.
    if (mounted === 0) set({ screenOpen: false, record: null, lastTime: null });
    else set({ screenOpen: true });
  },
  // A record always wins over the quieter "on last time" line.
  showRecord: (exercise, label, lines) => set({ record: { id: ++seq, exercise, label, lines }, lastTime: null }),
  clearRecord: (id) => {
    if (get().record?.id === id) set({ record: null });
  },
  requestScroll: (exKey) => set({ scrollTo: { id: ++seq, exKey } }),
  showRowNote: (exKey, setKey, missing) => set({ rowNote: { id: ++seq, exKey, setKey, missing } }),
  popTick: (exKey, setKey) => set({ tickPop: { id: ++seq, exKey, setKey } }),
  showLastTime: (exercise, text) => {
    if (get().record) return; // the record toast is on screen: it stays
    set({ lastTime: { id: ++seq, exercise, text } });
  },
  clearLastTime: (id) => {
    if (get().lastTime?.id === id) set({ lastTime: null });
  },
  askTypo: (exKey, setKey, text, kind) => set({ typoAsk: { id: ++seq, exKey, setKey, text, kind } }),
  clearTypo: (exKey, setKey) => {
    const cur = get().typoAsk;
    if (cur && cur.exKey === exKey && cur.setKey === setKey) set({ typoAsk: null });
  },
  focusEntry: (f) => {
    const cur = get().entryFocus;
    if (cur && cur.exKey === f.exKey && cur.setKey === f.setKey && cur.field === f.field) return;
    set({ entryFocus: f });
  },
  blurEntry: (exKey, setKey, field) => {
    const cur = get().entryFocus;
    if (!cur || cur.exKey !== exKey || cur.setKey !== setKey) return;
    if (field && cur.field !== field) return;
    set({ entryFocus: null });
  },
}));
