/**
 * Gym tab → leaderboard → a gym mate's name (R-164): their profile, read-only, laid out like your own
 * Profile tab: initials (there is no photo on the server), the leaderboard name, Workouts in the last
 * 60 days, the bio, then one card per workout as the Profile feed draws it (the full date, the
 * workout's name, Time · Kg lifted, the exercises with their pictures), with each exercise's best
 * set. No share, no menu, nothing to open: the sets themselves never leave their phone.
 * Only with a gym joined (GymOnly). They stopped sharing (or hid their name, or left): one plain line.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { GhostButton, Screen, Skeleton } from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { fmtVol, type UnitSystem } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { ExerciseThumb } from '@/tracker/components/ExerciseThumb';
import { feedDate } from '@/tracker/services/feedCard';
import { durationText } from '@/tracker/services/finishCheck';

import { GymOnly } from './GymOnly';
import { useGymShop } from './gymStore';
import { MATE_WORDS, exerciseLine, initialsOf, type MateProfile, type MateWorkout } from './mateProfile';
import { readMateProfile } from './mateSync';
import { leave } from './ShopParts';

const THUMB = 40;

export function MateProfileScreen() {
  return (
    <GymOnly>
      <MateProfilePage />
    </GymOnly>
  );
}

type State = { kind: 'loading' } | { kind: 'profile'; profile: MateProfile } | { kind: 'closed' } | { kind: 'failed' };

function MateProfilePage() {
  const router = useRouter();
  const units = useUnits();
  const link = useGymShop((s) => s.link);
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const shownName = typeof params.name === 'string' && params.name.trim() ? params.name.trim().slice(0, 40) : MATE_WORDS.title;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pulling, setPulling] = useState(false);

  const load = useCallback(
    async (byPull: boolean) => {
      if (!link || !id) {
        setState({ kind: 'closed' });
        return;
      }
      if (byPull) setPulling(true);
      const r = await readMateProfile(link, id);
      setState((s) => (r.kind === 'failed' && s.kind === 'profile' ? s : r));
      setPulling(false);
    },
    [link, id],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const name = state.kind === 'profile' ? state.profile.name : shownName;
  const body = { fontFamily: type.body, fontSize: type.size.body, lineHeight: 21, color: color.inkSecondary } as const;

  return (
    <Screen title={name} onBack={() => leave(router, '/shop')} scroll={false} noPad>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void load(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {state.kind === 'loading' ? (
          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', paddingVertical: space.md }}>
            <Skeleton width={76} height={76} radius={38} />
            <View style={{ flex: 1, gap: space.sm }}>
              <Skeleton width="60%" height={18} radius={radius.sm} />
              <Skeleton width="40%" height={18} radius={radius.sm} />
            </View>
          </View>
        ) : state.kind === 'closed' ? (
          <Text accessibilityLiveRegion="polite" style={{ ...body, paddingVertical: space.lg }}>
            {MATE_WORDS.closed}
          </Text>
        ) : state.kind === 'failed' ? (
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <Text accessibilityLiveRegion="polite" style={body}>
              {MATE_WORDS.failed}
            </Text>
            <GhostButton label={MATE_WORDS.tryAgain} onPress={() => void load(false)} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.sm }}>
              <Initials name={state.profile.name} size={76} />
              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <Text numberOfLines={1} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                  {state.profile.name}
                </Text>
                <View accessible accessibilityLabel={`Workouts shared: ${state.profile.workouts.length}`}>
                  {/* "Shared", not "in 60 days": the share holds at most 30 (0.60.0 review). */}
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>Workouts shared</Text>
                  <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{fmtInt(state.profile.workouts.length)}</Text>
                </View>
              </View>
            </View>
            {state.profile.bio ? <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 21, color: color.ink }}>{state.profile.bio}</Text> : null}
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 20, color: color.inkMuted }}>{MATE_WORDS.from(state.profile.name)}</Text>
            {state.profile.workouts.length === 0 ? <Text style={body}>{MATE_WORDS.empty}</Text> : null}
            {state.profile.workouts.map((w) => (
              <MateWorkoutCard key={w.id} w={w} name={state.profile.name} units={units} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** The round initials, as the Profile tab's photo circle shows a letter when there is no photo. */
function Initials({ name, size }: { name: string; size: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: type.heading, fontSize: Math.round(size * 0.36), color: color.ink }}>{initialsOf(name)}</Text>
    </View>
  );
}

/** One workout, as a card of the Profile feed (FeedCard) lays it out, read-only. */
function MateWorkoutCard({ w, name, units }: { w: MateWorkout; name: string; units: UnitSystem }) {
  const stats: { label: string; value: string }[] = [];
  if (w.min > 0) stats.push({ label: MATE_WORDS.stats.time, value: durationText(w.min * 60 * 1000) });
  if (w.kg > 0.5) stats.push({ label: units === 'imperial' ? MATE_WORDS.stats.lb : MATE_WORDS.stats.kg, value: fmtVol(w.kg, units) });
  if (w.ex.length > 0) stats.push({ label: MATE_WORDS.stats.exercises, value: fmtInt(w.ex.length) });
  const date = feedDate(w.d);
  const lines = w.ex.map((e) => exerciseLine(e, units));
  return (
    <View
      accessible
      accessibilityLabel={[w.name, date, ...stats.map((s) => `${s.label} ${s.value}`), ...lines].join('. ')}
      style={{ paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: color.border }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
        <Initials name={name} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {name}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
            {date}
          </Text>
        </View>
      </View>
      <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{w.name}</Text>
      {stats.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.sm }}>
          {stats.map((st) => (
            <View key={st.label}>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{st.label}</Text>
              <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{st.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {w.ex.length > 0 ? (
        <View style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
          {w.ex.map((e, i) => (
            <View key={`${i}-${e.n}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: THUMB, height: THUMB, borderRadius: THUMB / 2, overflow: 'hidden', backgroundColor: color.surfaceRaised }}>
                <ExerciseThumb catalogKey={e.k} name={e.n} size={THUMB} media={null} />
              </View>
              <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink }}>{lines[i]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
