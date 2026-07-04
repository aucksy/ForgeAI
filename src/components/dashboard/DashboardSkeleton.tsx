import { View } from 'react-native';

import { Skeleton } from '@/components/ui';
import { radius, space } from '@/theme/tokens';

/** Loading layout mirroring the dashboard sections — shown until data arrives. */
export function DashboardSkeleton() {
  return (
    <View style={{ gap: space.lg }}>
      {/* hero */}
      <Skeleton width="100%" height={252} radius={radius.xl} />
      {/* streak row */}
      <Skeleton width="100%" height={74} radius={radius.lg} />
      {/* 2x2 stat grid */}
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Skeleton width="100%" height={168} radius={radius.lg} />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton width="100%" height={168} radius={radius.lg} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Skeleton width="100%" height={108} radius={radius.lg} />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton width="100%" height={108} radius={radius.lg} />
          </View>
        </View>
      </View>
      {/* trend cards */}
      <Skeleton width="100%" height={118} radius={radius.lg} />
      <Skeleton width="100%" height={118} radius={radius.lg} />
      {/* insight */}
      <Skeleton width="100%" height={92} radius={radius.lg} />
      {/* next up */}
      <Skeleton width="100%" height={80} radius={radius.lg} />
    </View>
  );
}
