import { View } from 'react-native';

import { Skeleton } from '@/components/ui';
import { space } from '@/theme/tokens';

/** Skeleton conversation shown while chat history loads — never a blank flash. */
export function ChatSkeleton() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: space.screenX,
        paddingBottom: space.md,
        gap: space.md,
      }}
    >
      <View style={{ alignItems: 'flex-start' }}>
        <Skeleton width={230} height={58} radius={18} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Skeleton width={180} height={44} radius={18} />
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Skeleton width={280} height={140} radius={20} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Skeleton width={140} height={40} radius={18} />
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Skeleton width={210} height={52} radius={18} />
      </View>
    </View>
  );
}
