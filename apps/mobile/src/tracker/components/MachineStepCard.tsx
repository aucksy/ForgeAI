/**
 * F194 (owner R-352, 5 Nov 2026; scored 8 on 7 Nov): Settings -> Plates and bars -> "Machine and
 * cable steps". One row, a choice sheet like "Weight step": Automatic (the default, the
 * app's guess from the weights logged on each machine or cable, R-310), 2.5 kg or 5 kg. A machine's
 * or cable's Target then names only weights on that grid (`engine/weightLadder.ts` `stackStepKg`);
 * barbells and dumbbells keep their own rules.
 */
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { SettingRow } from '@/components/settings/SettingRow';
import { Card } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { choiceDetail, choiceLabel, MACHINE_STEP_CHOICES, MACHINE_STEP_HELP, MACHINE_STEP_WHY } from '../services/targetChoices';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { PrefChoiceSheet } from './PrefChoiceSheet';

const ROW_VALUE = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, maxWidth: 140, textAlign: 'right' }) as const;

export function MachineStepCard() {
  const machineStep = useTrackerPrefs((s) => s.machineStep);
  const setMachineStep = useTrackerPrefs((s) => s.setMachineStep);
  const [open, setOpen] = useState(false);
  const label = choiceLabel(MACHINE_STEP_CHOICES, machineStep);
  return (
    <>
      <Card style={{ paddingVertical: space.xs }}>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Machine and cable steps, ${label}. Change`}>
          <SettingRow
            icon="dumbbell"
            title="Machine and cable steps"
            caption={choiceDetail(MACHINE_STEP_CHOICES, machineStep)}
            right={
              // Fresh-eyes 7 Nov: "Learn from my weights" squeezed the title to one word a line; now "Automatic", one line.
              <Text numberOfLines={1} style={ROW_VALUE()}>
                {label}
              </Text>
            }
          />
        </Pressable>
      </Card>
      <PrefChoiceSheet
        visible={open}
        title="Machine and cable steps"
        subtitle={MACHINE_STEP_HELP}
        footnote={MACHINE_STEP_WHY}
        choices={MACHINE_STEP_CHOICES}
        value={machineStep}
        onChoose={(v) => {
          setMachineStep(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
