/**
 * Progress tab (Release A, A5, docs/ux/MEMBER-APP-MAP.md §3.1; owner yes 24 Oct 2026). What sat behind
 * the Profile's tiles, one tap from anywhere, so Profile can go back to being about you:
 *  - Your training: Charts (the old Statistics page: last 7 days, sets for each muscle, main lifts,
 *    records, reports), Exercises (every exercise with its history and how-to), Records;
 *  - Your body: Body (the old Measures page: body weight, measurements and progress photos);
 *  - Reports: the latest monthly report and the year so far (or last year's review).
 * Release B fills more blocks here (which muscles are ready today, badges); no block shows before
 * it has something real in it.
 */
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { GymBrandMark } from '@/components/GymBrandMark';
import { LinkRow } from '@/components/stats/parts';
import { Icon, Screen, type IconName } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { navigateOnce } from '@/lib/guardedAction';
import { color, space, type } from '@/theme/tokens';
import { reportRows } from '@/tracker/lib/progressTab';
import { getTrainedMonths } from '@/tracker/services/reportsService';

function Dot({ icon }: { icon: IconName }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={color.accent} />
    </View>
  );
}

/** A block's heading: small grey caps, as Settings' groups. Read when drawn: gym branding repaints the tokens. */
function BlockHeading({ title }: { title: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: space.md }}
    >
      {title}
    </Text>
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const [months, setMonths] = useState<readonly string[] | null>(null);
  // One page per tap, however fast the taps.
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getTrainedMonths()
        .then((m) => {
          if (alive) setMonths(m);
        })
        .catch((e: unknown) => {
          console.warn('[progress] months could not be read', e);
          if (alive) setMonths((m) => m ?? []);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  const open = (href: Href): void => {
    navigateOnce(busy, () => router.push(href));
  };
  const reports = months ? reportRows(months, todayISO()) : [];

  return (
    <Screen title="Progress">
      <View style={{ gap: space.sm, paddingBottom: space.xl }}>
        {/* Gym branding: the member's gym, small, under the title (branded gyms only). */}
        <GymBrandMark />

        <BlockHeading title="Your training" />
        <LinkRow title="Charts" sub="Your last 7 days, sets for each muscle and your main lifts" leading={<Dot icon="chart" />} onPress={() => open('/stats')} />
        <LinkRow title="Exercises" sub="Every exercise, with its history and how to do it" leading={<Dot icon="dumbbell" />} onPress={() => open('/exercises')} />
        <LinkRow title="Records" sub="Your best weights and reps" leading={<Dot icon="trophy" />} onPress={() => open('/records')} />

        <BlockHeading title="Your body" />
        <LinkRow title="Body" sub="Body weight, measurements and progress photos" leading={<Dot icon="scale" />} onPress={() => open('/measures')} />

        <BlockHeading title="Reports" />
        {reports.map((r) => (
          <LinkRow
            key={r.period}
            title={r.title}
            sub={r.sub}
            leading={<Dot icon="calendar" />}
            onPress={() => open({ pathname: '/report/[period]', params: { period: r.period } })}
          />
        ))}
        {months && reports.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkMuted }}>
            Your monthly report and year in review show here after your first workout.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
