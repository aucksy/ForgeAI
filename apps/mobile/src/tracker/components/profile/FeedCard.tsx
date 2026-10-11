/**
 * Redesign R2 — one card of the Profile's Workouts feed, laid out like Hevy's (PLAN §3 item 6):
 * the member's photo or letter, name and full date, ⋯; the workout's name; Time · Kg lifted ·
 * Records; the first 3 exercises with their pictures in circles ("3 sets Chin Up"), then
 * "See 2 more exercises"; one share button at the bottom. No likes, no comments. The words are
 * `feedCardFacts` (PURE, tested). Tap the card → the workout.
 */
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';
import type { UnitSystem } from '@/lib/units';

import type { FeedThumb, FeedItem } from '../../services/profileService';
import { feedCardFacts } from '../../services/feedCard';
import { ExerciseThumb } from '../ExerciseThumb';
import { Glyph } from '../TrackerGlyph';
import { Avatar } from './Avatar';

const THUMB = 40;

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
  name,
  photoUri,
  units,
  onOpen,
  onMore,
  onShare,
}: {
  feed: FeedItem;
  thumbs: ReadonlyMap<string, FeedThumb>;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: 48 }}>
          <Avatar uri={photoUri} name={name} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {name}
            </Text>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{f.date}</Text>
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

      {/* ⋯ top right (over the card's top row). */}
      <Pressable
        onPress={() => onMore(id)}
        accessibilityRole="button"
        accessibilityLabel={`More for ${f.title}`}
        style={{ position: 'absolute', top: space.lg - 4, right: -8, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="more" size={22} color={color.inkSecondary} />
      </Pressable>

      {/* The one bottom button: share (picture or text). */}
      <Pressable
        onPress={() => onShare(id)}
        accessibilityRole="button"
        accessibilityLabel={`Share ${f.title}`}
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          marginLeft: -12,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Glyph name="share" size={22} color={color.inkSecondary} />
      </Pressable>
    </View>
  );
});
