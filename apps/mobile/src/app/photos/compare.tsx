/** Two progress photos side by side, older on the left, with their dates (Phase 3). */
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { EmptyState, IconButton, LoadError, Screen, Skeleton } from '@/components/ui';
import { useLoad } from '@/lib/useLoad';
import { shortDate } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';
import { apartText } from '@/tracker/lib/months';
import { getProgressPhotos, type ProgressPhoto } from '@/tracker/services/progressPhotos';

export default function ComparePhotosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  // A failed read says "Couldn't load these photos" — not "One of these photos was deleted".
  const load = useLoad<[ProgressPhoto, ProgressPhoto] | null>(async () => {
    const all = await getProgressPhotos();
    const a = all.find((p) => p.id === params.a);
    const b = all.find((p) => p.id === params.b);
    if (!a || !b) return null;
    const older = a.dateISO < b.dateISO || (a.dateISO === b.dateISO && a.createdAt <= b.createdAt) ? a : b;
    return older === a ? [a, b] : [b, a];
  }, [params.a, params.b]);
  const pair = load.state === 'ready' ? load.data : undefined;

  return (
    <Screen
      title="Compare"
      subtitle={pair ? apartText(pair[0].dateISO, pair[1].dateISO) : undefined}
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      {load.state === 'error' ? (
        <LoadError what="these photos" onRetry={load.retry} />
      ) : pair === undefined ? (
        <Skeleton width="100%" height={360} radius={radius.lg} />
      ) : pair === null ? (
        <EmptyState icon="camera" title="Photos not found" body="One of these photos was deleted. Go back and pick two again." />
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {pair.map((p, i) => (
            <View key={p.id} style={{ flex: 1, gap: space.sm }}>
              <View
                style={{
                  aspectRatio: 3 / 4,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  backgroundColor: color.surfaceRaised,
                  borderWidth: 1,
                  borderColor: color.border,
                }}
              >
                <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" />
              </View>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink, textAlign: 'center' }}>
                {i === 0 ? 'Before' : 'After'}
              </Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
                {shortDate(p.dateISO)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
