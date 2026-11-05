/**
 * R-339 (5 Nov 2026): the iPhone build. Parts not built for iPhone yet (docs/ios/PARITY.yaml) ask
 * this and say so on screen instead of showing an Android page that does nothing there.
 * False in the unit tests, where react-native is a stub or a vi.mock without Platform.
 */
import { Platform } from 'react-native';

export function onIphone(): boolean {
  try {
    return Platform?.OS === 'ios';
  } catch {
    // quiet: only a unit test's react-native mock lacks Platform; a real phone always has it.
    return false;
  }
}
