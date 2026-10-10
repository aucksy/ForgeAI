/**
 * Plain bottom sheet for the workout screen's small choices (Phase 1). Now a thin name for the
 * shared `Sheet` in components/ui, which scrolls when its content is taller than the screen
 * (LW-16 / EX-11) — every sheet built on this gets that for free. New code: use `Sheet`.
 */
import type { ReactNode } from 'react';

import { Sheet } from '@/components/ui/Sheet';

export { SheetRow } from '@/components/ui/Sheet';

export function TrackerSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      {children}
    </Sheet>
  );
}
