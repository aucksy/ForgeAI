/**
 * Redesign R2 — one card of the Profile's Workouts feed, laid out like Hevy's (PLAN §3 item 6):
 * the member's photo or letter, name and full date, ⋯; the workout's name; Time · Kg lifted ·
 * Records; the first 3 exercises with their pictures in circles ("3 sets Chin Up"), then
 * "See 2 more exercises". Share and ⋯ sit together at the top right, beside the name (12 Oct
 * 2026: share had a row of its own at the bottom, alone in empty space). No likes, no comments.
 * The words are `feedCardFacts` (PURE, tested). Tap the card → the workout.
 *
 * 15 Oct 2026: a workout's photos (up to 4, `workoutPhotos.ts`) show as a small strip of squares
 * under its numbers, as Hevy shows a workout's pictures on its feed card. Private: shown from the
 * app's own folder with `cachePolicy="memory"`, never written to the image disk cache.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';
import type { UnitSystem } from '@/lib/units';

import type { FeedThumb, FeedItem } from '../../services/profileService';
import { feedCardFacts } from '../../services/feedCard';
import { ExerciseThumb } from '../ExerciseThumb';
import { Glyph } from '../TrackerGlyph';
import { Avatar } from './Avatar';

const THUMB = 40;
/** A workout photo's square on the card. */
const PHOTO = 56;
const TOP_BUTTON = 48;

/** One of the two round buttons at the card's top right (share, ⋯): a 48 dp target. */
function TopButton({ glyph, label, onPress }: { glyph: 'share' | 'more'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: TOP_BUTTON, height: TOP_BUTTON, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Glyph name={glyph} size={22} color={color.inkSecondary} />
    </Pressable>
  );
}

function Round({ thumb, name }: { thumb: FeedThumb | undefined; name: string }) {
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: THUMB / 2, overflow: 'hidden', backgroundColor: color.surfaceRaised }}>
      <ExerciseThumb
        catalogKey={thumb?.catalogKey ?? null}
        name={name}
        size={THUMB}
        media={thumb ? { uri: thumb.mediaUri, type: thumb.mediaType } : null}
      />
    </View>
  );
}

export const FeedCard = memo(function FeedCard({
  feed,
  thumbs,
  photos = [],
  name,
  photoUri,
  units,
  onOpen,
  onMore,
  onShare,
}: {
  feed: FeedItem;
  thumbs: ReadonlyMap<string, FeedThumb>;
  /** This workout's photo paths, in order (15 Oct 2026). */
  photos?: readonly string[];
  name: string;
  photoUri: string | null;
  units: UnitSystem;
  onOpen: (id: string) => void;
  onMore: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const f = feedCardFacts(feed.item, feed.records, units);
  const id = feed.item.id;
  return (
    <View style={{ paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: color.border }}>
      <Pressable
        onPress={() => onOpen(id)}
        accessibilityRole="button"
        accessibilityLabel={`${f.label}. Open`}
        style={({ pressed }) => ({ gap: space.md, opacity: pressed ? 0.85 : 1 })}
      >
        {/* Who and when. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingRight: 2 * TOP_BUTTON - 8 }}>
          <Avatar uri={photoUri} name={name} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {name}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
              {f.date}
            </Text>
          </View>
        </View>

        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{f.title}</Text>

        {f.stats.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.sm }}>
            {f.stats.map((st) => (
              <View key={st.label}>
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{st.label}</Text>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{st.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {photos.length > 0 ? (
          <View
            accessible
            accessibilityLabel={photos.length === 1 ? '1 photo' : `${photos.length} photos`}
            style={{ flexDirection: 'row', gap: space.sm }}
          >
            {photos.slice(0, 4).map((uri) => (
              <View key={uri} style={{ width: PHOTO, height: PHOTO, borderRadius: 10, overflow: 'hidden', backgroundColor: color.surfaceRaised, borderWidth: 1, borderColor: color.border }}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory" />
              </View>
            ))}
          </View>
        ) : null}

        {f.rows.length > 0 ? (
          <View style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
            {f.rows.map((r) => (
              <View key={r.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Round thumb={thumbs.get(r.exerciseId)} name={r.name} />
                <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{r.text}</Text>
              </View>
            ))}
            {f.more ? (
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, textAlign: 'center', paddingTop: space.xs }}>
                {f.more}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {/* Share and ⋯, top right, centred on the name row (which is at least 48 dp tall). */}
      <View style={{ position: 'absolute', top: space.lg, right: -8, height: TOP_BUTTON, flexDirection: 'row', alignItems: 'center' }}>
        <TopButton glyph="share" label={`Share ${f.title}`} onPress={() => onShare(id)} />
        <TopButton glyph="more" label={`More for ${f.title}`} onPress={() => onMore(id)} />
      </View>
    </View>
  );
});
