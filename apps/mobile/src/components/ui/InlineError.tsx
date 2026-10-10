/**
 * Phase 1: the short line shown under a button whose action failed ("Couldn't start the
 * workout. Try again."). Calm, inline, announced to screen readers — no pop-up.
 * Render nothing when there is no message, so it can sit in the layout permanently.
 * Phase 7: spoken the moment it appears and whenever its words change (`useAnnounce`). No
 * live region as well — with both, TalkBack said it twice (see `shouldAnnounce`).
 */
import { Text } from 'react-native';

import { color, type } from '@/theme/tokens';

import { useAnnounce } from './useAnnounce';

export function InlineError({ message }: { message: string | null | undefined }) {
  useAnnounce(message);
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, textAlign: 'center', lineHeight: 19 }}
    >
      {message}
    </Text>
  );
}
