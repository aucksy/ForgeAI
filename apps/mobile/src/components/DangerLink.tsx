/**
 * Audit Phase 7 (packet B, docs/DESIGN-LANGUAGE.md "Buttons"): the ONE destructive control — a
 * red text link. It never deletes on its own: the caller asks first (`askConfirm`, the app's own
 * sheet) or offers Undo. 48 dp tall to the finger; says what it does ("Discard workout").
 */
import { Pressable, Text } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

export interface DangerLinkProps {
  label: string;
  onPress: () => void;
  /** Spoken name when the label alone is not enough (default: the label). */
  accessibilityLabel?: string;
  disabled?: boolean;
}

export function DangerLink({ label, onPress, accessibilityLabel, disabled }: DangerLinkProps) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        alignSelf: 'center',
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: space.lg,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.criticalText, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}
