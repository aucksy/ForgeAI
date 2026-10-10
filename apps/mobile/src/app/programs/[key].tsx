/**
 * One ready program — Phase 4: what it is, then follow it (its routines become your plan
 * and "Today" comes from them) or keep it in your routines. Its routines fold below, each
 * exercise with its sets and the rep range the research table gives this program.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge, Card, EmptyState, GhostButton, Icon, PrimaryButton, Screen, SectionHeader } from '@/components/ui';
import { ToggleRow } from '@/components/settings/SettingRow';
import { countWord } from '@/lib/words';
import { goBack } from '@/lib/goBack';
import { color, space, type } from '@/theme/tokens';

import { EASY_EVERY, EASY_WEEKS_DEFAULT } from '@/tracker/plans/easyWeek';
import { EQUIPMENT_LABEL, programByKey, programMeta, programRoutines, setsAndReps } from '@/tracker/plans/programs';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { addProgram, existingProgramFolder, type ExistingChoice } from '@/tracker/services/plansService';
import { tell } from '@/lib/tell';

export default function ProgramScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const key = typeof params.key === 'string' ? params.key : params.key?.[0];
  const p = programByKey(key);
  const [easy, setEasy] = useState(EASY_WEEKS_DEFAULT);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const busy = useRef(false);
  /** RP-18: this program is already a folder of the member's ("Already in your routines"). */
  const [already, setAlready] = useState<{ name: string; following: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (key) {
        existingProgramFolder(key)
          .then((f) => {
            if (alive) setAlready(f ? { name: f.name, following: f.following } : null);
          })
          .catch(() => undefined);
      }
      return () => {
        alive = false;
      };
    }, [key]),
  );

  if (!p) {
    return (
      <Screen title="Program" onBack={() => goBack(router, '/workout')}>
        <EmptyState icon="dumbbell" title="Program not found" body="Go back and pick another." />
      </Screen>
    );
  }
  const routines = programRoutines(p);

  const add = async (follow: boolean, existing?: ExistingChoice): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      // RP-18: already added → that folder is updated (and followed when asked), never a second
      // one unless the member asked for a copy.
      await addProgram(p.key, { follow, easyWeeks: easy, existing });
      // Back to the Routines screen already open (not a second copy on top of the old ones).
      router.dismissTo('/routines');
    } catch {
      void tell('Could not add the program', 'Please try again.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <Screen
      title={p.name}
      subtitle={`${EQUIPMENT_LABEL[p.equipment]} · ${programMeta(p)}`}
      onBack={() => goBack(router, '/workout')}
    >
      <View style={{ gap: space.lg }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 21 }}>{p.summary}</Text>
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            icon="heart"
            title={`Easy week every ${EASY_EVERY} weeks`}
            caption="Half the sets, the same weights. Kept out of your records."
            value={easy}
            onChange={setEasy}
          />
        </Card>
        {already ? (
          <View style={{ gap: space.md }}>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
              {already.following ? `You follow this program ("${already.name}").` : `Already in your routines ("${already.name}").`}
            </Text>
            {!already.following ? <PrimaryButton label="Follow it" icon="check" onPress={() => void add(true, 'update')} /> : null}
            <GhostButton label="Add a copy" icon="plus" onPress={() => void add(false, 'copy')} />
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Follow this plan" icon="check" onPress={() => void add(true)} />
            <GhostButton label="Add to my routines" icon="plus" onPress={() => void add(false)} />
          </View>
        )}

        <View>
          <SectionHeader title={`${countWord(routines.length, 'routine')} · ${countWord(p.daysPerWeek, 'day')} a week`} />
          <View style={{ gap: space.md }}>
            {routines.map((r, i) => {
              const shown = open[i] === true;
              return (
                <Card key={r.name} style={{ gap: space.sm }}>
                  <Pressable
                    onPress={() => setOpen((o) => ({ ...o, [i]: !shown }))}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: shown }}
                    accessibilityLabel={`${r.name}, ${countWord(r.exercises.length, 'exercise')}`}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <View style={{ transform: [{ rotate: shown ? '90deg' : '0deg' }] }}>
                      <Icon name="chevron-right" size={16} color={color.inkMuted} />
                    </View>
                    <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.sub, color: color.ink }}>{r.name}</Text>
                    <View>
                      <Badge label={dayTypeLabel(r.dayType)} tone="neutral" />
                    </View>
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
                      {countWord(r.exercises.length, 'exercise')}
                    </Text>
                  </Pressable>
                  {shown
                    ? r.exercises.map((x) => (
                        <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg }}>
                          <Text numberOfLines={2} style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
                            {x.name}
                          </Text>
                          <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.ink }}>{setsAndReps(x)}</Text>
                        </View>
                      ))
                    : null}
                </Card>
              );
            })}
          </View>
        </View>
      </View>
    </Screen>
  );
}
