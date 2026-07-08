/** Read-only detail of a past workout (opened from History). */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { EmptyState, IconButton, Screen, Skeleton } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { radius, space } from '@/theme/tokens';

import { SessionSummary } from '@/tracker/components/SessionSummary';
import { dayTypeLabel, getSessionSummary } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (id) {
      getSessionSummary(id)
        .then((d) => {
          if (alive) {
            setData(d);
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Screen
      title={data ? dayTypeLabel(data.session.dayType) : 'Workout'}
      subtitle={data ? shortDate(data.session.dateISO) : undefined}
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={180} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} />
        </View>
      ) : data ? (
        <SessionSummary data={data} />
      ) : (
        <EmptyState icon="dumbbell" title="Workout not found" body="This session may have been deleted." />
      )}
    </Screen>
  );
}
