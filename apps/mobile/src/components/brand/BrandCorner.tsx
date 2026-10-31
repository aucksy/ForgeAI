/**
 * R-256 / R-259: MettleUp's logo and name in the top-right corner of the Workout, Progress and Gym
 * tabs (not Profile), passed as the page's `right`. A page that already has buttons there (the Gym's
 * bell and bag) passes them as children: they sit under the logo, so the corner stays the same on
 * every tab. Decoration only: a screen reader skips it (the page title says where you are).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { space } from '@/theme/tokens';

import { MettleUpLogo } from './MettleUpLogo';

/** The mark's size and the name's cap height in the corner (px). */
export const CORNER_MARK = 22;
export const CORNER_CAP = 12;

export function BrandCorner({ children }: { children?: ReactNode }) {
  return (
    <View style={{ alignSelf: children ? 'flex-start' : 'center', alignItems: 'flex-end', gap: space.sm }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MettleUpLogo height={CORNER_MARK} cap={CORNER_CAP} />
      </View>
      {children}
    </View>
  );
}
