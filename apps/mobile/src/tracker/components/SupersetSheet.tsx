/**
 * Superset chooser (bottom sheet). Pick a superset for an exercise: start a new
 * one, join an existing group, or remove it. A plain RN Modal (not a Compose
 * bottom sheet) so there's no swipe-veto deadlock risk.
 */
import { Modal, Pressable, Text, View } from 'react-native';

import { GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { supersetLabel } from '../lib/superset';

export function SupersetSheet({
  visible,
  currentGroup,
  otherGroups,
  nextGroup,
  onChoose,
  onClose,
}: {
  visible: boolean;
  /** The exercise's current group, or null if ungrouped. */
  currentGroup: number | null;
  /** Existing groups in the workout other than currentGroup (to join). */
  otherGroups: number[];
  /** The group number a "New superset" would create. */
  nextGroup: number;
  onChoose: (group: number | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: color.surfaceRaised,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderStrong,
          padding: space.xl,
          paddingBottom: space.xxl,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="zap" size={20} color={color.accent} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
              Superset
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="close" size={22} color={color.inkMuted} />
          </Pressable>
        </View>

        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
          Group exercises done back-to-back. They share a badge on this workout.
        </Text>

        <PrimaryButton
          label={`Start new superset (${supersetLabel(nextGroup)})`}
          icon="plus"
          onPress={() => onChoose(nextGroup)}
        />

        {otherGroups.map((g) => (
          <GhostButton
            key={g}
            label={`Join Superset ${supersetLabel(g)}`}
            icon="zap"
            onPress={() => onChoose(g)}
          />
        ))}

        {currentGroup != null ? (
          <GhostButton label="Remove from superset" icon="close" onPress={() => onChoose(null)} />
        ) : null}
      </View>
    </Modal>
  );
}
