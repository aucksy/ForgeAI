/**
 * Audit Phase 7: speak an error the moment it appears, and again when its words change. A live
 * region alone is not enough — iOS has none, and Android does not read a line that has only
 * just been added to the screen. So the line itself carries no live region (see
 * `shouldAnnounce`): one mechanism, said once.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { shouldAnnounce } from './a11y';

export function useAnnounce(message: string | null | undefined) {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (shouldAnnounce(prev.current, message)) {
      AccessibilityInfo.announceForAccessibility(message as string);
    }
    prev.current = message || null;
  }, [message]);
}
