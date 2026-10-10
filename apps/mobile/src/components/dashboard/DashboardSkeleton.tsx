import { View } from 'react-native';

import { Skeleton } from '@/components/ui';
import { radius, space } from '@/theme/tokens';

/** Loading layout mirroring Home (audit Phase 7): the answer card, then this week's numbers. */
export function DashboardSkeleton() {
  return (
    <View style={{ gap: space.lg }}>
      {/* answer card */}
      <Skeleton width="100%" height={196} radius={radius.xl} />
      {/* this week */}
      <Skeleton width="100%" height={150} radius={radius.lg} />
    </View>
  );
}
