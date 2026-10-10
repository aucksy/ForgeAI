/**
 * Audit Phase 8 review: drop everything kept in memory from the training data — the records,
 * the remembered Targets and the volume rule's context — and read Home again.
 *
 * The write queue already does this after every failed (rolled-back) write (`onWriteFailed`);
 * a screen whose own multi-step write failed (the import: demo removal, the import itself, the
 * restore of the safety copy) calls it as well, so nothing it showed while it ran can stay.
 */
import { useDashboard } from '@/store/dashboardStore';

import { forgetTargetMemo } from './coachTargets';
import { forgetRecordCache } from './recordsService';
import { forgetVolumeContext } from './volumeService';

export function forgetKeptTrainingData(): void {
  forgetRecordCache();
  forgetTargetMemo();
  forgetVolumeContext();
  void useDashboard
    .getState()
    .refresh()
    .catch(() => undefined);
}
