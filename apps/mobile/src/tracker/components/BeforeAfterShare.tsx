/**
 * F146 (from #58): "Share before and after" — two progress photos side by side in one picture, with
 * their days and the gym's logo and name, through the same share sheet as a workout (Post / Story,
 * Dark / See-through, Your gym: Show / Hide).
 *
 * The pair starts as the first photo and the latest (or the two the member compared). Above the
 * picture, "Before" and "After" show the two photos: tap one, then tap any photo in the row under
 * it to put that one in its place. The older photo is always "Before".
 *
 * Privacy: the picture is made on the phone from share-sized copies in the app's cache (deleted
 * when this sheet closes), and leaves the phone only through the share menu when the member taps
 * Share picture. No body weight or measurement is on it (share/beforeAfterCard.ts).
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { beforeAfterScene, defaultPair, inOrder, photoDayText } from '../share/beforeAfterCard';
import { beforeAfterCopy, clearBeforeAfterCopies } from '../services/beforeAfterCopies';
import type { ProgressPhoto } from '../services/progressPhotos';
import { ShareSheet } from './ShareSheet';

type Slot = 'before' | 'after';

function SlotTile({ label, photo, active, onPress }: { label: string; photo: ProgressPhoto; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${photoDayText(photo.dateISO)}. Tap to pick another photo`}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        padding: space.sm,
        borderRadius: radius.md,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color.accent : color.border,
        backgroundColor: color.surfaceRaised,
      }}
    >
      <Image source={{ uri: photo.uri }} style={{ width: 42, height: 56, borderRadius: 6 }} contentFit="cover" cachePolicy="memory" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{label}</Text>
        <Text numberOfLines={1} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {photoDayText(photo.dateISO)}
        </Text>
      </View>
    </Pressable>
  );
}

export function BeforeAfterShare({
  visible,
  photos,
  start,
  onClose,
}: {
  visible: boolean;
  /** Every progress photo (the row to pick from). */
  photos: readonly ProgressPhoto[];
  /** The pair to start with (default: the first photo and the latest). */
  start?: readonly [ProgressPhoto, ProgressPhoto] | null;
  onClose: () => void;
}) {
  const [pair, setPair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  // Each opening starts from the given pair (or first + latest). Only an opening resets it — not a
  // new array of the same photos.
  const startKey = start ? `${start[0].id}|${start[1].id}` : '';
  useEffect(() => {
    if (!visible) return;
    setPair(start ? inOrder(start[0], start[1]) : defaultPair(photos));
    setEditing(null);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, startKey]);

  // Closed: the copies go (a photo deleted later must leave no copy behind).
  useEffect(() => {
    if (visible) return;
    setCopies({});
    void clearBeforeAfterCopies();
  }, [visible]);

  // Share-sized copies of the two photos.
  useEffect(() => {
    if (!visible || !pair) return;
    let alive = true;
    const need = pair.filter((p) => !copies[p.id]);
    if (need.length === 0) return;
    Promise.all(need.map(async (p) => [p.id, await beforeAfterCopy(p)] as const))
      .then((made) => {
        if (alive) setCopies((c) => ({ ...c, ...Object.fromEntries(made) }));
      })
      .catch((e: unknown) => {
        console.warn('[ForgeErr] before/after photo copy', e);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [visible, pair, copies]);

  const ready = pair != null && pair.every((p) => copies[p.id] != null);
  const scene = useMemo(() => {
    if (!pair) return null;
    const [b, a] = pair;
    return beforeAfterScene({
      before: { uri: copies[b.id] ?? b.uri, dateISO: b.dateISO },
      after: { uri: copies[a.id] ?? a.uri, dateISO: a.dateISO },
    });
  }, [pair, copies]);

  if (!pair || !scene) return null;

  const choose = (p: ProgressPhoto): void => {
    if (!editing) return;
    const other = editing === 'before' ? pair[1] : pair[0];
    if (p.id === other.id) {
      // The photo already in the other place: swap the two.
      setPair([pair[1], pair[0]]);
    } else {
      setPair(inOrder(p, other));
    }
    setEditing(null);
    setFailed(false);
  };

  const header = (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <SlotTile label="Before" photo={pair[0]} active={editing === 'before'} onPress={() => setEditing(editing === 'before' ? null : 'before')} />
        <SlotTile label="After" photo={pair[1]} active={editing === 'after'} onPress={() => setEditing(editing === 'after' ? null : 'after')} />
      </View>
      {editing ? (
        <View style={{ gap: space.xs }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>
            {editing === 'before' ? 'Tap a photo for Before' : 'Tap a photo for After'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((p) => {
              const inPlace = p.id === (editing === 'before' ? pair[0].id : pair[1].id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => choose(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo from ${photoDayText(p.dateISO)}`}
                  style={{ gap: 4, alignItems: 'center' }}
                >
                  <Image
                    source={{ uri: p.uri }}
                    style={{ width: 60, height: 80, borderRadius: 8, borderWidth: inPlace ? 2 : 0, borderColor: color.accent }}
                    contentFit="cover"
                    cachePolicy="memory"
                  />
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: 11, color: color.inkMuted }}>{photoDayText(p.dateISO)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
          The older photo is Before. Tap Before or After to pick another photo.
        </Text>
      )}
      {failed ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.criticalText }}>
          Couldn’t open one of these photos. Pick another one.
        </Text>
      ) : null}
    </View>
  );

  return (
    <ShareSheet
      visible={visible}
      scene={scene}
      fileName={`mettleup-before-after-${pair[0].dateISO}-${pair[1].dateISO}`}
      title="Share before and after"
      subtitle="Put two of your progress photos side by side in one picture."
      header={header}
      photos
      preparing={!ready}
      onClose={onClose}
    />
  );
}
