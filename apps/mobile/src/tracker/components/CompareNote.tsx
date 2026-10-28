/**
 * R-75 (owner, 22 Oct 2026): the finish screen's comparison line opens to each exercise — which
 * went up, which went down, and the main reason ("2 sets fewer"). "Let this be collapsible ...
 * show the arrow on the right hand side". Starts shut; the chevron on the right turns when open.
 * Member words: never "volume", "PR" or "session".
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { deltaTag, spokenTag, type ExerciseDelta } from '../lib/workoutCompare';

// Up is green; down stays grey, never red (R-75: less on one exercise is not a failure).
const tagColor = (d: ExerciseDelta): string => (d.kind === 'up' ? color.goodText : d.kind === 'down' ? color.inkSecondary : color.inkMuted);

export function DeltaRow({ d }: { d: ExerciseDelta }) {
  const why = d.reason ?? (d.kind === 'skipped' ? 'Not done today' : d.kind === 'new' ? 'Not in that workout' : null);
  return (
    <View
      accessible
      accessibilityLabel={`${d.name}: ${spokenTag(d)}${d.reason ? `, ${d.reason}` : ''}.`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs }}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
          {d.name}
        </Text>
        {why ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: 1 }}>{why}</Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: tagColor(d) }}>{deltaTag(d)}</Text>
    </View>
  );
}

export function CompareNote({
  text,
  exercises,
  cause,
}: {
  text: string;
  exercises?: readonly ExerciseDelta[];
  cause?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const line = <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 21 }}>{text}</Text>;
  const rows = exercises ?? [];
  if (rows.length === 0) return <Card>{line}</Card>;
  return (
    <Card style={{ gap: space.sm }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${text} ${open ? 'Hide' : 'See'} each exercise.`}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
      >
        <View style={{ flex: 1 }}>
          {line}
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, marginTop: space.xs }}>
            {open ? 'Hide exercises' : `See each exercise (${rows.length})`}
          </Text>
        </View>
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
    </Card>
  );
}
