/**
 * Two progress photos side by side, older on the left, with their dates (Phase 3).
 *
 * Audit PG-18: each photo is shown WHOLE (contain, never cover) in two boxes of the same size,
 * so a wide photo next to a tall one keeps its arms and sides — both at the same scale against
 * the box. Tap either to open it full screen with pinch and double-tap zoom.
 */
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, IconButton, LoadError, Screen, Skeleton } from '@/components/ui';
import { useLoad } from '@/lib/useLoad';
import { goBack } from '@/lib/goBack';
import { dateWithYear } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';
import { ZoomImage } from '@/tracker/components/ZoomImage';
import { apartText } from '@/tracker/lib/months';
import { getProgressPhotos, type ProgressPhoto } from '@/tracker/services/progressPhotos';

export default function ComparePhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const [zoomed, setZoomed] = useState<{ photo: ProgressPhoto; label: string } | null>(null);
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
      onBack={() => goBack(router, '/analytics')}
    >
      {load.state === 'error' ? (
        <LoadError what="these photos" onRetry={load.retry} />
      ) : pair === undefined ? (
        <Skeleton width="100%" height={360} radius={radius.lg} />
      ) : pair === null ? (
        <EmptyState icon="camera" title="Photos not found" body="One of these photos was deleted. Go back and pick two again." />
      ) : (
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {pair.map((p, i) => {
              const label = i === 0 ? 'Before' : 'After';
              return (
                <View key={p.id} style={{ flex: 1, gap: space.sm }}>
                  <Pressable
                    onPress={() => setZoomed({ photo: p, label })}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${dateWithYear(p.dateISO)}. Open to zoom`}
                    style={{
                      aspectRatio: 3 / 4,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      backgroundColor: '#000',
                      borderWidth: 1,
                      borderColor: color.border,
                    }}
                  >
                    <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory" />
                  </Pressable>
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink, textAlign: 'center' }}>{label}</Text>
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
                    {dateWithYear(p.dateISO)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textAlign: 'center' }}>
            Tap a photo to open it and pinch to zoom.
          </Text>
        </View>
      )}

      <Modal visible={zoomed != null} animationType="fade" onRequestClose={() => setZoomed(null)} statusBarTranslucent>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md }}>
              <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                {zoomed ? `${zoomed.label} · ${dateWithYear(zoomed.photo.dateISO)}` : ''}
              </Text>
              <IconButton icon="close" onPress={() => setZoomed(null)} accessibilityLabel="Close photo" />
            </View>
            {zoomed ? <ZoomImage key={zoomed.photo.id} uri={zoomed.photo.uri} style={{ marginTop: space.md }} accessibilityLabel={`${zoomed.label} photo`} /> : null}
          </View>
        </GestureHandlerRootView>
      </Modal>
    </Screen>
  );
}
