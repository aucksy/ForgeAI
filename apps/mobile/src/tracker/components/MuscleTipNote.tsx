/**
 * Muscle tips (R-58, rebuilt R-482, R-492): the one calm line inside the Up next card.
 *  - "Smart suggestion" (i) on top of every tip (R-492, owner 14 Nov 2026: "so that they immediately know what they
 *    are looking at"); the (i) opens "Why we suggest this": the routines counted, the sets a week per muscle, how a
 *    set counts, why it matters, and that nothing changes until Add or Swap (engine `tipWhy`).
 *  - Tip 1: "None of your routines trains your calves. Add 3 sets of Standing Calf Raise to your Legs
 *    routine?" [Add] [Not now] · I skip this on purpose
 *  - Tip 2: "Your routines give your shoulders 3 sets a week and your chest 12. Add 3 sets of Dumbbell
 *    Shoulder Press to your Push routine, or swap Incline Dumbbell Press for it?" [Add] [Swap] [Not now] · Keep as is
 *    (R-492: "Some people might just want to add one exercise and not swap anything": Add takes nothing away).
 * It says what to do, never what is wrong (no red, no "missing"). The tip itself: services/muscleTips.
 * The (i) looks like every other "why" in the app (the Target line's ⓘ, InfoHeading): the tracker's info glyph,
 * muted, accent while open.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { TIP_LABEL } from '../engine/muscleBalance';
import type { MuscleTip, MuscleTipAction } from '../services/muscleTips';
import { Glyph } from './TrackerGlyph';
import { TrackerSheet } from './TrackerSheet';

export function MuscleTipNote({
  tip,
  onApply,
  onNotNow,
  onSkip,
  lastNotNow = false,
}: {
  tip: MuscleTip;
  /** A second "Not now" puts the group away for good (muscleTipsStore): the label says so. */
  lastNotNow?: boolean;
  /** "Add" (both tips) or "Swap" (tip 2). */
  onApply: (how: MuscleTipAction) => Promise<void>;
  onNotNow: () => void;
  /** "I skip this on purpose" (tip 1) or "Keep as is" (tip 2): that group stays quiet. */
  onSkip: () => void;
}) {
  const [busy, setBusy] = useState<MuscleTipAction | null>(null);
  const [why, setWhy] = useState(false);
  const swap = tip.kind === 'swap';
  const skipLabel = swap ? 'Keep as is' : 'I skip this on purpose';
  const press = (how: MuscleTipAction) => {
    if (busy) return;
    tap();
    setBusy(how);
    void onApply(how).finally(() => setBusy(null));
  };
  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.surfaceSunken, borderWidth: 1, borderColor: color.border, padding: space.md, paddingTop: space.xs, gap: space.sm }}>
      {/* R-492: what this is, and the (i) for why. The whole row is the tap target (44 dp), like InfoHeading. */}
      <Pressable
        onPress={() => {
          tap();
          setWhy(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${TIP_LABEL}. Why we suggest this`}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Icon name="sparkle" size={14} color={color.accentBright} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright }}>{TIP_LABEL}</Text>
        <Glyph name="info" size={18} color={why ? color.accent : color.inkMuted} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Icon name={swap ? 'dumbbell' : 'plus'} size={16} color={color.accentBright} />
        <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 19, color: color.ink }}>{tip.line}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
        <GhostButton label={busy === 'add' ? 'Adding…' : 'Add'} icon="plus" onPress={() => press('add')} />
        {swap ? <GhostButton label={busy === 'swap' ? 'Swapping…' : 'Swap'} icon="dumbbell" onPress={() => press('swap')} /> : null}
        <Pressable
          onPress={() => {
            tap();
            onNotNow();
          }}
          accessibilityRole="button"
          accessibilityLabel={lastNotNow ? "Not now. Don't suggest it again" : 'Not now. Ask again in 4 weeks'}
          style={{ minHeight: 48, paddingHorizontal: space.md, justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Not now</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          tap();
          onSkip();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${skipLabel}. Don't suggest it again`}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, textDecorationLine: 'underline' }}>{skipLabel}</Text>
      </Pressable>
      <TrackerSheet visible={why} title={tip.why.title} onClose={() => setWhy(false)}>
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <Text style={body}>{tip.why.counted}</Text>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>
              {tip.why.heading}
            </Text>
            {tip.why.rows.map((r) => (
              <View
                key={r.label}
                accessible
                accessibilityLabel={`${r.label}: ${r.sets} a week`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 }}
              >
                <Text style={{ flex: 1, fontFamily: r.tip ? type.bodySemi : type.body, fontSize: type.size.sub, color: r.tip ? color.accentBright : color.ink }}>
                  {r.label}
                </Text>
                <Text style={{ fontFamily: r.tip ? type.bodySemi : type.bodyMedium, fontSize: type.size.sub, color: r.tip ? color.accentBright : color.inkSecondary }}>
                  {r.sets}
                </Text>
              </View>
            ))}
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 17, color: color.inkMuted }}>{tip.why.rule}</Text>
          </View>
          <Text style={{ ...body, color: color.ink }}>{tip.why.reason}</Text>
          <Text style={body}>{tip.why.change}</Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 17, color: color.inkMuted }}>{tip.why.off}</Text>
        </View>
      </TrackerSheet>
    </View>
  );
}
