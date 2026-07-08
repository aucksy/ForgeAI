/** Post-workout celebratory summary. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import {
  EmptyState,
  GhostButton,
  HeroCard,
  Icon,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { color, gradients, radius, space, type } from '@/theme/tokens';

import { SessionSummary } from '@/tracker/components/SessionSummary';
import { dayTypeLabel, getSessionSummary, volumeComparison } from '@/tracker/services/finishSummary';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';

export default function FinishScreen() {
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
    <Screen title="Workout complete" subtitle="Nice work — logged and saved.">
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={128} radius={radius.xl} />
          <Skeleton width="100%" height={180} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          <HeroCard gradient={gradients.ember}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="trophy" size={28} color="#1F0D05" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: '#1F0D05' }}>
                  {dayTypeLabel(data.session.dayType)} done
                </Text>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)' }}>
                  {fmtInt(data.totalVolumeKg)} kg moved · {data.workingSetCount} sets
                </Text>
                {data.totalVolumeKg > 0 ? (
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: 'rgba(31,13,5,0.6)', marginTop: 2 }}>
                    That's about {volumeComparison(data.totalVolumeKg)}.
                  </Text>
                ) : null}
              </View>
            </View>
          </HeroCard>

          <SessionSummary data={data} />

          <View style={{ gap: space.md, marginTop: space.sm }}>
            <PrimaryButton label="Done" icon="check" onPress={() => router.replace('/')} />
            <GhostButton label="View history" icon="calendar" onPress={() => router.replace('/history')} />
          </View>
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <EmptyState
            icon="dumbbell"
            title="Summary unavailable"
            body="Your workout was saved — we just couldn't load its summary."
          />
          <PrimaryButton label="Done" icon="check" onPress={() => router.replace('/')} />
        </View>
      )}
    </Screen>
  );
}
