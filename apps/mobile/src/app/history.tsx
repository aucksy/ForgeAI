import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { LoadError, Screen, Skeleton } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { todayISO } from '@/lib/date';
import { historyTarget } from '@/lib/oldRoutes';
import { useLoad } from '@/lib/useLoad';
import { color, radius, space, type } from '@/theme/tokens';
import { WorkoutCard } from '@/tracker/components/WorkoutCard';
import { historyRangeLine, parseHistoryRange, type HistoryRange } from '@/tracker/lib/historyRange';
import { getHistoryBetween } from '@/tracker/services/historyFeed';

/**
 * Redesign R5: History is the Profile now — its Workouts feed, and Calendar behind the Calendar
 * tile. An old link to "/history" lands on the Profile; "/history?view=calendar" on Calendar.
 *
 * R-319 item 7 (owner, 4 Nov 2026): "/history?from=…&to=…" lists the workouts of one week, month
 * or day — what a chart's "See these workouts" opens. Without a range it redirects as before.
 */
export default function HistoryRoute() {
  const params = useLocalSearchParams<{ view?: string | string[]; from?: string | string[]; to?: string | string[] }>();
  const range = parseHistoryRange(params);
  if (!range) return <Redirect href={historyTarget(params.view)} />;
  return <HistoryInRange range={range} />;
}

function HistoryInRange({ range }: { range: HistoryRange }) {
  const router = useRouter();
  const today = todayISO();
  const list = useLoad(() => getHistoryBetween(range.from, range.to), [range.from, range.to], { onFocus: true });
  const items = list.data ?? [];

  return (
    <Screen title="Your workouts" onBack={() => goBack(router, '/profile')}>
      <View style={{ gap: space.md, paddingBottom: space.xl }}>
        {list.state === 'loading' && !list.data ? (
          <>
            <Skeleton width="100%" height={96} radius={radius.md} />
            <Skeleton width="100%" height={96} radius={radius.md} />
          </>
        ) : list.state === 'error' && !list.data ? (
          <LoadError what="these workouts" onRetry={list.retry} />
        ) : (
          <>
            <Text accessibilityRole="header" style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
              {historyRangeLine(items.length, range, today)}
            </Text>
            {items.map((s) => (
              <WorkoutCard key={s.id} session={s} onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })} />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
