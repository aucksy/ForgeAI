/**
 * Draws a share-picture scene on the phone (Phase 3). The same scene `sceneToSvg` writes for
 * tests and previews, drawn with react-native-svg — whose `toDataURL` turns it into a PNG of
 * the full picture size, so sharing needs no extra native add-on.
 */
import { forwardRef } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { MAP_OUTLINE, NATIVE_FONT, bodyPaths, bodyView, type Scene } from './scene';

export interface SceneSvgProps {
  scene: Scene;
  /** Width on screen; the height follows the picture's shape. */
  width: number;
}

export const SceneSvg = forwardRef<Svg, SceneSvgProps>(function SceneSvg({ scene, width }, ref) {
  const height = (width * scene.height) / scene.width;
  let gid = 0;
  return (
    <Svg ref={ref} width={width} height={height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
      <Rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.background} />
      {scene.nodes.map((n, i) => {
        switch (n.t) {
          case 'rect':
            return (
              <Rect
                key={i}
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={n.r ?? 0}
                fill={n.fill}
                stroke={n.stroke}
                strokeWidth={n.stroke ? n.strokeWidth ?? 1 : undefined}
                opacity={n.opacity}
              />
            );
          case 'gradient': {
            const id = `sg${gid++}`;
            return (
              <G key={i}>
                <Defs>
                  <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={n.from} />
                    <Stop offset="1" stopColor={n.to} />
                  </LinearGradient>
                </Defs>
                <Rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.r ?? 0} fill={`url(#${id})`} />
              </G>
            );
          }
          case 'glow': {
            const id = `sg${gid++}`;
            return (
              <G key={i}>
                <Defs>
                  <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor={n.color} stopOpacity={n.opacity} />
                    <Stop offset="1" stopColor={n.color} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={n.cx} cy={n.cy} r={n.r} fill={`url(#${id})`} />
              </G>
            );
          }
          case 'circle':
            return <Circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} />;
          case 'text':
            return (
              <SvgText
                key={i}
                x={n.x}
                y={n.y}
                fill={n.fill}
                fontFamily={NATIVE_FONT[n.font]}
                fontSize={n.size}
                textAnchor={n.anchor ?? 'start'}
                opacity={n.opacity}
              >
                {n.text}
              </SvgText>
            );
          case 'path': {
            const moved = n.x != null || n.y != null || n.scale != null;
            const path = (
              <Path
                d={n.d}
                fill={n.fill ?? 'none'}
                stroke={n.stroke}
                strokeWidth={n.stroke ? n.strokeWidth ?? 1 : undefined}
                strokeLinecap={n.stroke ? 'round' : undefined}
                strokeLinejoin={n.stroke ? 'round' : undefined}
              />
            );
            return moved ? (
              <G key={i} transform={`translate(${n.x ?? 0} ${n.y ?? 0}) scale(${n.scale ?? 1})`}>
                {path}
              </G>
            ) : (
              <G key={i}>{path}</G>
            );
          }
          case 'body': {
            const view = bodyView(n);
            const s = n.height / view.viewBox.height;
            return (
              <G key={i} transform={`translate(${n.x} ${n.y}) scale(${s}) translate(${-view.viewBox.x} ${-view.viewBox.y})`}>
                {bodyPaths(n).map((p, k) => (
                  <Path key={k} d={p.d} fill={p.fill} />
                ))}
                <Path d={view.outline} fill="none" stroke={MAP_OUTLINE} strokeWidth={1.5 / s} />
              </G>
            );
          }
          default:
            return null;
        }
      })}
    </Svg>
  );
});
