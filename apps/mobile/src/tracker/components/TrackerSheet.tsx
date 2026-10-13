/**
 * Plain bottom sheet for the workout screen's small choices (Phase 1). Now a thin name for the
 * shared `Sheet` in components/ui, which scrolls when its content is taller than the screen
 * (LW-16 / EX-11) — every sheet built on this gets that for free. New code: use `Sheet`.
 *
 * 13 Oct 2026: a sheet whose choices apply at once and that STAYS open after one (Set type, with
 * RPE) passes `onDone` + `changed`: a ✓ "Done" then shows beside the × once something changed
 * (`DoneSheet`). Sheets that close on the choice itself (rest, counting, superset, swap) need none.
 */
import type { ReactNode } from 'react';

import { Sheet } from '@/components/ui/Sheet';

import { DoneSheet } from './DoneSheet';

export { SheetRow } from '@/components/ui/Sheet';

export function TrackerSheet({
  visible,
  title,
  subtitle,
  onClose,
  onDone,
  changed = false,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** ✓ "Done" beside the × (keep and close), shown once `changed`. */
  onDone?: () => void;
  changed?: boolean;
  children: ReactNode;
}) {
  if (onDone) {
    return (
      <DoneSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} onDone={onDone} showDone={changed}>
        {children}
      </DoneSheet>
    );
  }
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      {children}
    </Sheet>
  );
}
