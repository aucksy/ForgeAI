/**
 * The Gym tab's "How busy the gym is" card (R-163). "Quiet right now", "About 15 people checked in
 * during the last 90 minutes" (only when 5 or more), then the usual busy level per hour for today (chips
 * for the other days), "Quietest later today: 2 pm to 4 pm", and where the numbers come from.
 *
 * Hidden until the gym's server answers with enough check-ins (0039 not live, or a gym with few timed
 * check-ins: no card, no error). Drawn only for a joined gym (the Gym tab's GymShop). The gym's own
 * hours, when set, win for "now" (holidays too). The sums and words: gymBusy.ts (tested).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Card, Chip } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { color, radius, space, type } from '@/theme/tokens';
import type { DayKey, GymHours } from '@forgeai/theme';

import { useNowTick } from './GymHoursRow';
import {
  aboutLine,
  barSpoken,
  closedAllToday,
  dayChipLabel,
  daysFromToday,
  hourSpan,
  hourWords,
  indiaDayHour,
  levelLine,
  levelNow,
  quietestLine,
  sourceLine,
  type GymBusy,
} from './gymBusy';
import { peekGymBusy, readGymBusy, type BusyRead } from './gymBusySync';
import type { GymLink } from './types';

const BAR_MAX = 44;

export function GymBusyCard({ link, hours, refreshKey }: { link: GymLink; hours: GymHours | null; refreshKey: number }) {
  const [busy, setBusy] = useState<GymBusy | null>(() => peekGymBusy(link));
  const [picked, setPicked] = useState<DayKey | null>(null);
  const now = useNowTick(60000);
  const askedFor = useRef(refreshKey);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      const apply = (r: BusyRead): void => {
        if (!live) return;
        if (r.kind === 'busy') setBusy(r.busy);
        else if (r.kind === 'hidden') setBusy(null);
      };
      // A new pull to refresh asks at once; opening the tab asks at most every 5 minutes.
      const force = askedFor.current !== refreshKey;
      askedFor.current = refreshKey;
      void readGymBusy(link, { force }).then(apply);
      return () => {
        live = false;
      };
    }, [link, refreshKey]),
  );

  if (!busy) return null;
  const span = hourSpan(busy);
  const at = indiaDayHour(now);
  const level = levelNow(busy, hours, now);
  const about = aboutLine(busy, level);
  const day = picked ?? at.day;
  const isToday = day === at.day;
  const closedToday = isToday && closedAllToday(hours, at.dateISO);
  const quiet = quietestLine(busy, day, now, hours);
  const bars = span ? busy.week[day].slice(span.from, span.to + 1) : [];
  const muted = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;

  return (
    <Card style={{ gap: space.sm, marginTop: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>
        How busy the gym is
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {levelLine(level)}
      </Text>
      {about ? <Text style={muted}>{about}</Text> : null}

      {span ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            style={{ marginTop: space.sm, marginHorizontal: -space.md }}
            contentContainerStyle={{ paddingHorizontal: space.md, gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP }}
          >
            {daysFromToday(at.day).map((d) => (
              <Chip key={d} role="radio" label={dayChipLabel(d, at.day)} selected={d === day} onPress={() => setPicked(d)} />
            ))}
          </ScrollView>
          {closedToday ? (
            <Text style={muted}>Your gym is closed today.</Text>
          ) : (
            <View>
              <View
                accessible
                accessibilityLabel={`Usually, ${isToday ? 'today' : dayChipLabel(day, at.day)}: ${bars.map((v, i) => barSpoken(span.from + i, v)).join(', ')}`}
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: BAR_MAX }}
              >
                {bars.map((v, i) => {
                  const h = span.from + i;
                  const nowBar = isToday && h === at.hour;
                  return (
                    <View
                      key={h}
                      style={{
                        flex: 1,
                        height: v == null ? 2 : v === 0 ? 4 : Math.round((v / 4) * BAR_MAX),
                        borderRadius: radius.sm,
                        backgroundColor: v == null ? color.border : nowBar ? color.accent : color.accentSoft,
                      }}
                    />
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
                <Text style={{ ...muted, color: color.inkMuted }}>{hourWords(span.from)}</Text>
                <Text style={{ ...muted, color: color.inkMuted }}>{hourWords(span.to + 1)}</Text>
              </View>
            </View>
          )}
          {quiet ? <Text style={{ ...muted, fontFamily: type.bodySemi, color: color.ink }}>{quiet}</Text> : null}
        </>
      ) : null}
      <Text style={{ ...muted, color: color.inkMuted }}>{sourceLine(busy.weeks)}</Text>
    </Card>
  );
}
