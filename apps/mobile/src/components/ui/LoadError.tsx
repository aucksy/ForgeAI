/**
 * The one "couldn't load" state (Appendix B: "Error: 'Couldn't load — Try again'; never
 * 'No data'"). Use it wherever a read can fail, instead of an empty list that looks like
 * the member has nothing.
 */
import { Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

import { GhostButton } from './GhostButton';

export interface LoadErrorProps {
  onRetry: () => void;
  /** What failed, e.g. "your workouts" → "Couldn't load your workouts". */
  what?: string;
  /** Optional second line (no codes, no stack traces). */
  detail?: string;
  /** Smaller version for inside a card. */
  compact?: boolean;
}

export function LoadError({ onRetry, what, detail, compact }: LoadErrorProps) {
  const title = what ? `Couldn't load ${what}` : "Couldn't load";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', gap: space.md, paddingVertical: compact ? space.lg : space.xxxl, paddingHorizontal: space.xl }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontFamily: type.heading, fontSize: compact ? type.size.body : type.size.h3, color: color.ink, textAlign: 'center' }}
      >
        {title}
      </Text>
      {detail ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
          {detail}
        </Text>
      ) : null}
      <View style={{ minWidth: 160 }}>
        <GhostButton label="Try again" onPress={onRetry} />
      </View>
    </View>
  );
}
