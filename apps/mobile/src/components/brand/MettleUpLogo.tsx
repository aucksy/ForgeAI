/**
 * MettleUp's lockup for the app's own screens (first MettleUp release, 0.56.0): the Forged
 * hex-dumbbell mark + "METTLEUP", "UP" in Forge orange. Replaces the frozen components/ui/Logo
 * (it still draws "FORGEAI" and may not be edited) at the same sizes: `height` is the mark's
 * square, as it was the old mark's, and the name sits to its right at the old name's size.
 *
 * Drawn with plain <Path>s (the M is cut out in the geometry, see mettleUpMark.ts), so it needs no
 * mask or clip support. Colours are read when it draws, never at load time (gym looks repaint the
 * tokens in place); the mark and "UP" are MettleUp's own and never take a gym's colour.
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color } from '@/theme/tokens';

import { MARK_BOX, MARK_FACES, METTLEUP_COLOURS, WORDMARK_BOX, WORDMARK_METTLE_D, WORDMARK_UP_D } from './mettleUpMark';

export interface MettleUpLogoProps {
  /** The mark's height (and width) in px; the name follows. Default 28, as the old Logo. */
  height?: number;
}

/** The name's cap height as a share of the mark (the old "FORGEAI" in Sora at 0.64 x height). */
const CAP = 0.44;
/** The gap between the mark and the name (as the old Logo). */
const GAP = 0.32;

/** The mark alone, `size` px square. */
export function MettleUpMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.size} ${MARK_BOX.size}`}>
      {MARK_FACES.map((f, i) => (
        <Path key={i} d={f.d} fill={f.fill} />
      ))}
    </Svg>
  );
}

export function MettleUpLogo({ height = 28 }: MettleUpLogoProps) {
  const cap = height * CAP;
  const wordH = (cap * WORDMARK_BOX.h) / 100;
  const wordW = (cap * WORDMARK_BOX.w) / 100;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityRole="image" accessibilityLabel="MettleUp">
      <MettleUpMark size={height} />
      <Svg
        width={wordW}
        height={wordH}
        viewBox={`${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.w} ${WORDMARK_BOX.h}`}
        style={{ marginLeft: height * GAP }}
      >
        <Path d={WORDMARK_METTLE_D} fill={color.ink} />
        <Path d={WORDMARK_UP_D} fill={METTLEUP_COLOURS.forge} />
      </Svg>
    </View>
  );
}

export default MettleUpLogo;
