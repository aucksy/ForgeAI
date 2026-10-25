/**
 * Gym tab → Gym timings (R-124, 25 Oct 2026): open or closed right now, the week Monday to Sunday
 * with today marked (this week's special days put in), the special days coming up, and the gym's
 * note ("Ladies batch 11 am to 12 pm"). All in India time. The kept copy shows at once (works
 * offline after the first answer); the gym is asked when the page opens and on a pull. Read-only:
 * the gym's owner sets the hours in the admin app. Only with a gym joined (GymOnly).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import { dateWords, openStatus, specialWords, upcomingSpecial, indiaNow, weekRows } from '@forgeai/theme';

import { GymOnly } from './GymOnly';
import { useNowTick } from './GymHoursRow';
import { useGymShop } from './gymStore';
import type { GymHoursCopy } from './gymTimings';
import { readGymHours, syncGymHours } from './gymTimingsSync';
import { leave } from './ShopParts';

/** Special days listed on the page: the next 60 days. */
const SPECIAL_LIST_DAYS = 60;

export function GymHoursScreen() {
  return (
    <GymOnly>
      <GymHours />
    </GymOnly>
  );
}

function GymHours() {
  const router = useRouter();
  const link = useGymShop((s) => s.link);
  const [copy, setCopy] = useState<GymHoursCopy | null | undefined>(undefined);
  const [pulling, setPulling] = useState(false);
  const running = useRef(false);
  const now = useNowTick();

  const refresh = useCallback(
    async (byPull: boolean) => {
      if (running.current) return;
      running.current = true;
      if (byPull) setPulling(true);
      const kept = await readGymHours(link);
      setCopy((c) => (c === undefined ? kept : c));
      const fresh = await syncGymHours(link, { force: byPull });
      if (fresh) setCopy(fresh);
      running.current = false;
      setPulling(false);
    },
    [link],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh(false);
    }, [refresh]),
  );

  const gymName = copy?.gymName ?? link?.gymName ?? 'Your gym';
  const hours = copy?.hours ?? null;
  const today = indiaNow(now).dateISO;

  return (
    <Screen title="Gym timings" onBack={() => leave(router, '/shop')} scroll={false} noPad>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {copy === undefined ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary, paddingVertical: space.lg }}>Loading…</Text>
        ) : !hours ? (
          <EmptyState icon="clock" title="No timings yet" body={`${gymName} hasn't added its opening times in MettleUp yet. Ask at the desk.`} />
        ) : (
          <>
            <View style={card()}>
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                {openStatus(hours, now).line}
              </Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{`${gymName} · India time`}</Text>
              {hours.note ? <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>{hours.note}</Text> : null}
            </View>

            <View style={card()}>
              <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                This week
              </Text>
              {weekRows(hours, now).map((d) => (
                <View
                  key={d.key}
                  accessible
                  accessibilityLabel={`${d.name}${d.today ? ', today' : ''}: ${d.lines.join(', ')}${d.special?.note ? `, ${d.special.note}` : ''}`}
                  style={{
                    flexDirection: 'row',
                    gap: space.md,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.sm,
                    marginHorizontal: -space.sm,
                    borderRadius: radius.md,
                    backgroundColor: d.today ? color.accentSoft : 'transparent',
                  }}
                >
                  <View style={{ width: 96 }}>
                    <Text style={{ fontFamily: d.today ? type.bodyBold : type.bodySemi, fontSize: type.size.body, color: d.today ? color.accent : color.ink }}>{d.name}</Text>
                    {d.today ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.accent }}>Today</Text> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    {d.lines.map((l) => (
                      <Text key={l} style={{ fontFamily: type.body, fontSize: type.size.body, color: d.lines[0] === 'Closed' ? color.inkMuted : color.inkSecondary }}>
                        {l}
                      </Text>
                    ))}
                    {d.special ? (
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.accent }}>
                        {d.special.note ? `${dateWords(d.dateISO)} · ${d.special.note}` : `Special hours on ${dateWords(d.dateISO)}`}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>

            {upcomingSpecial(hours, now, SPECIAL_LIST_DAYS).length > 0 ? (
              <View style={card()}>
                <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                  Coming up
                </Text>
                {upcomingSpecial(hours, now, SPECIAL_LIST_DAYS).map((s) => (
                  <Text key={s.date} style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>
                    {specialWords(s, today)}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const card = () => ({ padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, gap: space.sm }) as const;
