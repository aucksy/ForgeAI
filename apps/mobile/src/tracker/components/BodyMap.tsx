/**
 * Front and back body drawing with each muscle shaded by how much it was trained (Phase 3).
 * Drawing: react-native-body-highlighter (MIT), see catalog/bodyMapPaths. v0.25.1: the male
 * or female figure, as the member chose in Profile ("Body figure").
 */
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, space, type } from '@/theme/tokens';

import { BODY_VIEWS, type BodyFigure, type BodyView } from '../catalog/bodyMapPaths';
import type { Muscle } from '../catalog/muscles';
import type { MapLevel } from '../engine/bodyMap';
import { MAP_OUTLINE, regionFill } from '../lib/bodyMapColors';

function Figure({ view, levels, height }: { view: BodyView; levels: ReadonlyMap<Muscle, MapLevel>; height: number }) {
  const vb = view.viewBox;
  return (
    <Svg width={height / 2} height={height} viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}>
      {view.parts.map((p, i) => (
        <Path key={i} d={p.d} fill={regionFill(p.region, levels)} />
      ))}
      <Path d={view.outline} fill="none" stroke={MAP_OUTLINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

export function BodyMap({
  levels,
  figure = 'male',
  height = 220,
  labels = true,
}: {
  levels: ReadonlyMap<Muscle, MapLevel>;
  figure?: BodyFigure;
  height?: number;
  labels?: boolean;
}) {
  const views = BODY_VIEWS[figure];
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}
      accessibilityLabel={`Body map of the muscles you trained, ${figure} figure, front and back`}
    >
      {[
        { view: views.front, label: 'Front' },
        { view: views.back, label: 'Back' },
      ].map(({ view, label }) => (
        <View key={label} style={{ alignItems: 'center' }}>
          <Figure view={view} levels={levels} height={height} />
          {labels ? (
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs }}>
              {label}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
