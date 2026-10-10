/**
 * Phase 1: the short line shown under a button whose action failed ("Couldn't start the
 * workout. Try again."). Calm, inline, announced to screen readers — no pop-up.
 * Render nothing when there is no message, so it can sit in the layout permanently.
 */
import { Text } from 'react-native';

import { color, type } from '@/theme/tokens';

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, textAlign: 'center', lineHeight: 19 }}
    >
      {message}
    </Text>
  );
}
