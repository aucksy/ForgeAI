/**
 * Superset chooser (bottom sheet).
 *
 * LW-26: a superset always has at least two exercises. Instead of "Start new superset" (which
 * made a superset of one, badge and all), the member picks the PARTNER: "Superset with Row".
 * They can also join an existing superset, or leave theirs (a pair left with one is dissolved
 * by the store, so no lone "Superset A" badge stays behind). Letters follow the screen order.
 * Built on the shared Sheet, so it scrolls at large text (LW-16).
 */
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { supersetLabel } from '../lib/superset';
import { SheetRow, TrackerSheet } from './TrackerSheet';

export function SupersetSheet({
  visible,
  currentGroup,
  pairWith,
  join,
  onPair,
  onJoin,
  onLeave,
  onClose,
}: {
  visible: boolean;
  /** The exercise's current group, or null if ungrouped. */
  currentGroup: number | null;
  /** Exercises not in a superset that this one can pair with. */
  pairWith: readonly { key: string; name: string }[];
  /** Other supersets this one can join, with their exercises. */
  join: readonly { group: number; names: string[] }[];
  onPair: (otherKey: string) => void;
  onJoin: (group: number) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const nothing = pairWith.length === 0 && join.length === 0 && currentGroup == null;
  return (
    <TrackerSheet
      visible={visible}
      title={currentGroup != null ? `Superset ${supersetLabel(currentGroup)}` : 'Superset'}
      subtitle="Exercises done back to back, resting after the round."
      onClose={onClose}
    >
      {nothing ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
          Add another exercise to the workout to make a superset with it.
        </Text>
      ) : null}
      {pairWith.length > 0 ? (
        <View style={{ gap: 2 }}>
          {pairWith.map((p) => (
            <SheetRow
              key={p.key}
              label={`Superset with ${p.name}`}
              leading={<Icon name="zap" size={20} color={color.accent} />}
              onPress={() => onPair(p.key)}
            />
          ))}
        </View>
      ) : null}
      {join.length > 0 ? (
        <View style={{ gap: 2, marginTop: pairWith.length > 0 ? space.xs : 0 }}>
          {join.map((j) => (
            <SheetRow
              key={j.group}
              label={`Join Superset ${supersetLabel(j.group)}`}
              value={j.names.join(' + ')}
              leading={<Icon name="zap" size={20} color={color.accent} />}
              onPress={() => onJoin(j.group)}
            />
          ))}
        </View>
      ) : null}
      {currentGroup != null ? (
        <SheetRow
          label="Remove from superset"
          leading={<Icon name="close" size={20} color={color.inkMuted} />}
          onPress={onLeave}
        />
      ) : null}
    </TrackerSheet>
  );
}
