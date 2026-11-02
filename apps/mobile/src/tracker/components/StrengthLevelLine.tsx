/**
 * F57: "Strength level: Intermediate" under an exercise's chart, with a "What this means" sheet.
 *
 * Shows only for the main barbell and dumbbell lifts (`strengthLevel.hasStrengthLevel`) once the
 * member has a best estimated 1-rep max. With no weigh-in yet, the line asks for one and opens
 * Body weight. The sheet explains the levels in words and lets the member pick who they are
 * compared with (Everyone · Men · Women). It never shows the body weight, a ratio or a kilo target:
 * any of them would divide back to the body weight (see the engine's header).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { Icon, Sheet } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import type { LoadMode } from '@/tracker/engine/logTypes';
import {
  STRENGTH_LEVEL_LABEL,
  STRENGTH_LEVEL_MEANING,
  STRENGTH_LEVELS,
  STRENGTH_STANDARD_LABEL,
  STRENGTH_STANDARDS,
  hasStrengthLevel,
  strengthLevelLine,
  strengthLevelView,
  strengthStandardFor,
  type StrengthStandard,
} from '@/tracker/engine/strengthLevel';
import { getStrengthLevelData, saveStrengthStandard, type StrengthLevelData } from '@/tracker/services/strengthLevelData';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

const STANDARD_OPTIONS: readonly ChipOption<StrengthStandard>[] = STRENGTH_STANDARDS.map((id) => ({ id, label: STRENGTH_STANDARD_LABEL[id] }));

export interface StrengthLevelLineProps {
  catalogKey: string | null | undefined;
  /** The exercise's best estimated 1-rep max (the records engine's `e1rm` best), or null. */
  best: { value: number; dateISO: string; loadMode?: LoadMode | null } | null;
  exerciseLoadMode: LoadMode;
  /** Opens Body weight (Measurements). */
  onLogWeight: () => void;
}

export function StrengthLevelLine({ catalogKey, best, exerciseLoadMode, onLogWeight }: StrengthLevelLineProps) {
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const [data, setData] = useState<StrengthLevelData | null>(null);
  const [open, setOpen] = useState(false);
  const wanted = hasStrengthLevel(catalogKey) && best != null;

  // Re-read on focus: coming back from logging a body weight shows the level at once.
  useFocusEffect(
    useCallback(() => {
      if (!wanted) return;
      let alive = true;
      getStrengthLevelData()
        .then((d) => {
          if (alive) setData(d);
        })
        .catch((e: unknown) => {
          // The line simply stays away; the rest of the page is unaffected.
          console.warn('[strengthLevel] could not read body weight', e);
        });
      return () => {
        alive = false;
      };
    }, [wanted]),
  );

  if (!wanted || !data) return null;
  const standard = strengthStandardFor(data.savedStandard, figure);
  const view = strengthLevelView({ catalogKey, best, exerciseLoadMode, weighIns: data.weighIns, standard });
  const line = strengthLevelLine(view);
  if (!line) return null;

  const pick = (s: StrengthStandard): void => {
    setData((d) => (d ? { ...d, savedStandard: s } : d));
    saveStrengthStandard(s).catch((e: unknown) => {
      console.warn('[strengthLevel] could not save the comparison choice', e);
    });
  };

  if (view.kind === 'needWeight') {
    return (
      <Pressable
        onPress={onLogWeight}
        accessibilityRole="link"
        accessibilityLabel={`${line}. Open Body weight`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, opacity: pressed ? 0.6 : 1 })}
      >
        <Icon name="scale" size={16} color={color.accent} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{line}</Text>
        <Icon name="chevron-right" size={18} color={color.inkMuted} />
      </Pressable>
    );
  }

  const current = view.kind === 'level' ? view.level : null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${line}. What this means`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, opacity: pressed ? 0.6 : 1 })}
      >
        <Icon name="trophy" size={16} color={color.accent} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{line}</Text>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accent }}>What this means</Text>
      </Pressable>
      <Sheet visible={open} title="Strength level" onClose={() => setOpen(false)}>
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <Text style={bodyText()}>
            Your level compares your best lift on this exercise (the most you could lift once, worked out from your best set) with your body weight on that day. Your body weight stays private and is never shown.
          </Text>
          {STRENGTH_LEVELS.map((l) => (
            <View key={l} style={{ gap: 2 }} accessibilityLabel={`${STRENGTH_LEVEL_LABEL[l]}${l === current ? ', your level' : ''}. ${STRENGTH_LEVEL_MEANING[l]}`}>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: l === current ? color.accent : color.ink }}>
                {STRENGTH_LEVEL_LABEL[l]}
                {l === current ? ' · your level' : ''}
              </Text>
              <Text style={bodyText()}>{STRENGTH_LEVEL_MEANING[l]}</Text>
            </View>
          ))}
          <ChipGroup label="Compare me with" options={STANDARD_OPTIONS} selectedId={standard} onSelect={pick} />
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 17 }}>
            A rough guide made by MettleUp from published strength guides. Age and height are not counted. A new best lift or a new body weight can change your level.
          </Text>
        </View>
      </Sheet>
    </>
  );
}

const bodyText = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }) as const;
