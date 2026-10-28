/**
 * R-147 (owner, 27 Oct 2026): the proud headline of the workout-complete screen — today's kg lifted
 * big, "+45 kg more than last time" in green (a kind line when lower, never red), last time's total and
 * which workout it was. The words are `kgHero` (PURE, tested). With the comparison's exercises it
 * also opens to each one (up, down, why), as the comparison line did (R-75), so one card says it all.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import type { ExerciseDelta } from '../lib/workoutCompare';
import type { KgHero } from '../services/kgHero';
import { DeltaRow } from './CompareNote';

export function KgHeroCard({ hero, exercises, cause }: { hero: KgHero; exercises?: readonly ExerciseDelta[]; cause?: string | null }) {
  const [open, setOpen] = useState(false);
  const rows = exercises ?? [];
  const lineColor = hero.tone === 'up' ? color.goodText : color.inkSecondary;
  return (
    <Card style={{ gap: space.sm, borderWidth: 2, borderColor: hero.tone === 'up' ? color.goodText : color.border }}>
      <View accessible accessibilityRole="header" accessibilityLabel={`${hero.label}: ${hero.big}. ${hero.line}${hero.lastLine ? ` ${hero.lastLine}.` : ''}`}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>{hero.label}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{ fontFamily: type.displaySemi, fontSize: type.size.hero, color: color.ink, marginTop: 2 }}
        >
          {hero.big}
        </Text>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: lineColor, marginTop: space.xs }}>{hero.line}</Text>
        {hero.lastLine ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, marginTop: 2 }}>{hero.lastLine}</Text>
        ) : null}
      </View>
      {rows.length > 0 ? (
        <>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${open ? 'Hide' : 'See'} each exercise against last time`}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 }}
          >
            <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
              {open ? 'Hide exercises' : `See each exercise (${rows.length})`}
            </Text>
            <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
              <Icon name="chevron-right" size={20} color={color.inkMuted} />
            </View>
          </Pressable>
          {open ? (
            <View style={{ borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.sm, gap: space.xs }}>
              {cause ? (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{cause}</Text>
              ) : null}
              {rows.map((d) => (
                <DeltaRow key={`${d.kind}-${d.exerciseId}`} d={d} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
