/**
 * "Easy week" note (Phase 4) — on the Workout tab and the live workout while the followed plan
 * is in an easy week. The fact stays on screen (half the sets, the same weights); the why
 * waits behind the i, like every other explaining sentence.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { shortDate } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { EASY_REASON } from '../plans/easyWeek';
import { Glyph } from './TrackerGlyph';

/** `until`: the easy week's last day (RP-04: the end date is always on screen when known). */
export function EasyWeekNote({ until }: { until?: string | null } = {}) {
  const [open, setOpen] = useState(false);
  const end = until ? ` Until ${shortDate(until)}.` : '';
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.accentSoft, paddingHorizontal: space.md }}>
      <Pressable
        onPress={() => {
          tap();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Easy week: half the sets, the same weights.${end} More information`}
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Icon name="heart" size={16} color={color.accentBright} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accentBright }}>
          Easy week: half the sets, the same weights.{end}
        </Text>
        <Glyph name="info" size={18} color={open ? color.accentBright : color.inkMuted} />
      </Pressable>
      {open ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19, paddingBottom: space.md }}>
          {EASY_REASON}
        </Text>
      ) : null}
    </View>
  );
}
