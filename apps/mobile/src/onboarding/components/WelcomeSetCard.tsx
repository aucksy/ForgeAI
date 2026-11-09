/**
 * The welcome's picture of the app (R-276 / R-277, owner 2 Nov 2026: "show exactly what the app shows,
 * with total kg beaten", then "add RPE"): a still copy of one exercise card in a workout, drawn with the
 * real card's colours and styles (tracker/components/ExerciseLogCard.tsx + SetRow.tsx, RPE colours from
 * tracker/lib/rpe.ts rpeColor). Barbell Bench Press, 4 ticked sets of 75 kg, beating last time's
 * 1,500 kg plan (kgLiveLine's own words). Nothing in it can be tapped.
 *
 * A screen reader hears ONE line, "Example of a logged bench press"; every number inside is hidden.
 * Its text is capped at 1.2x the font size: it is a picture, and at the owner's 360 dp / font 1.3 the
 * six columns would otherwise run out of room (the words around it scale in full).
 */
import { Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { Badge } from '@/components/LookBadge';
import { rpeColor } from '@/tracker/lib/rpe';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { color, radius, space, type } from '@/theme/tokens';

import { START_WORDS } from '../welcomeStart';

/** ExerciseLogCard's beaten-Target tint. */
const GOOD_SOFT = 'rgba(61, 203, 108, 0.14)';
/** SetRow's ticked-row tint. */
const DONE_ROW = 'rgba(12, 163, 12, 0.12)';
/** SetRow's check mark on the green tick. */
const ON_GOOD = '#05140A';
const CAP = 1.2;

/** Exported for the test: the sets in the picture. */
export const EXAMPLE_SETS = [
  { kg: 75, reps: 5, rpe: 7, prevRpe: 7 },
  { kg: 75, reps: 5, rpe: 8, prevRpe: 8 },
  { kg: 75, reps: 6, rpe: 8, prevRpe: 8 },
  { kg: 75, reps: 6, rpe: 9, prevRpe: 8 },
] as const;
export const EXAMPLE_PREVIOUS = '72.5 × 5';
export const EXAMPLE_LINE = "Today's 1,500 kg beaten (1,650 kg done)";

// The columns, as the design (SET / PREVIOUS / KG / REPS / RPE / ✓).
const W = { set: 22, kg: 50, reps: 42, rpe: 28, tick: 38 } as const;
const GAP = 6;

const colHead = () =>
  ({ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4, textAlign: 'center' }) as const;

function ValueBox({ value, width }: { value: number; width: number }) {
  return (
    <View
      style={{
        width,
        height: 32,
        borderRadius: radius.sm - 2,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text maxFontSizeMultiplier={CAP} style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>
        {value}
      </Text>
    </View>
  );
}

export function WelcomeSetCard() {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={START_WORDS.exampleCard}>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
        style={{
          backgroundColor: color.surface,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: 22,
          padding: 14,
          gap: 10,
        }}
      >
        {/* header: the small picture, the name, the muscle chip, rest and where PREVIOUS comes from */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: color.border,
              backgroundColor: color.surfaceRaised,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="dumbbell" size={24} color={color.inkSecondary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text maxFontSizeMultiplier={CAP} style={{ fontFamily: type.heading, fontSize: 16, color: color.ink }}>
              Barbell Bench Press
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 4 }}>
              <Badge label="Chest" tone="accent" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="clock" size={13} color={color.inkMuted} />
                <Text maxFontSizeMultiplier={CAP} style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>
                  1:30 · Previous: 23 Oct
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* the Target box, beaten (green) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: color.goodText,
            backgroundColor: GOOD_SOFT,
            paddingHorizontal: space.md,
            paddingVertical: 8,
          }}
        >
          <Icon name="check" size={14} color={color.goodText} />
          <Text maxFontSizeMultiplier={CAP} style={{ flex: 1, fontFamily: type.bodySemi, fontSize: 14, color: color.goodText }}>
            {EXAMPLE_LINE}
          </Text>
          <Glyph name="info" size={16} color={color.inkMuted} />
        </View>

        {/* column heads */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: 6 }}>
          <Text maxFontSizeMultiplier={CAP} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[colHead(), { width: W.set }]}>
            SET
          </Text>
          <Text maxFontSizeMultiplier={CAP} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[colHead(), { flex: 1, textAlign: 'left' }]}>
            PREVIOUS
          </Text>
          <Text maxFontSizeMultiplier={CAP} numberOfLines={1} style={[colHead(), { width: W.kg }]}>
            KG
          </Text>
          <Text maxFontSizeMultiplier={CAP} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[colHead(), { width: W.reps }]}>
            REPS
          </Text>
          <Text maxFontSizeMultiplier={CAP} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[colHead(), { width: W.rpe }]}>
            RPE
          </Text>
          <View style={{ width: W.tick, alignItems: 'center' }}>
            <Icon name="check" size={14} color={color.inkMuted} />
          </View>
        </View>

        {/* four ticked sets */}
        <View style={{ gap: 6 }}>
          {EXAMPLE_SETS.map((s, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: GAP,
                backgroundColor: DONE_ROW,
                borderRadius: radius.sm,
                paddingHorizontal: 6,
                paddingVertical: 4,
              }}
            >
              <Text maxFontSizeMultiplier={CAP} style={{ width: W.set, textAlign: 'center', fontFamily: type.monoBold, fontSize: 15, color: color.inkSecondary }}>
                {i + 1}
              </Text>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={CAP} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={prevStyle()}>
                  {EXAMPLE_PREVIOUS}
                </Text>
                <Text maxFontSizeMultiplier={CAP} numberOfLines={1} style={prevStyle()}>
                  @ {s.prevRpe}
                </Text>
              </View>
              <ValueBox value={s.kg} width={W.kg} />
              <ValueBox value={s.reps} width={W.reps} />
              <Text maxFontSizeMultiplier={CAP} style={{ width: W.rpe, textAlign: 'center', fontFamily: type.monoBold, fontSize: 14, color: rpeColor(s.rpe) }}>
                {s.rpe}
              </Text>
              <View
                style={{
                  width: W.tick,
                  height: 32,
                  borderRadius: radius.sm - 2,
                  backgroundColor: color.good,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="check" size={18} color={ON_GOOD} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** SetRow's PREVIOUS style (a touch larger here, as the design). */
const prevStyle = () => ({ fontFamily: type.mono, fontSize: 13, lineHeight: 16, color: color.inkSecondary }) as const;
