import { ScrollView } from 'react-native';

import { Chip } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { space } from '@/theme/tokens';

export interface SuggestedPromptsProps {
  onPrompt: (prompt: string) => void;
}

/** The PRD's 12 suggested prompts. */
const PROMPTS: { label: string; icon: IconName }[] = [
  { label: "Today's workout", icon: 'dumbbell' },
  { label: 'Log workout', icon: 'plus' },
  { label: 'Log meal', icon: 'meal' },
  { label: 'Upload food photo', icon: 'camera' },
  { label: 'Show my progress', icon: 'trend' },
  { label: 'Weekly summary', icon: 'calendar' },
  { label: 'Monthly summary', icon: 'chart' },
  { label: 'Show my records', icon: 'medal' },
  { label: 'Nutrition today', icon: 'meal' },
  { label: 'Calories remaining', icon: 'meal' },
  { label: 'Protein remaining', icon: 'meal' },
  { label: 'What should I lift today?', icon: 'sparkle' },
];

export function SuggestedPrompts({ onPrompt }: SuggestedPromptsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: space.screenX,
        gap: space.sm,
        paddingVertical: space.xs,
      }}
    >
      {PROMPTS.map((p) => (
        <Chip key={p.label} label={p.label} icon={p.icon} onPress={() => onPrompt(p.label)} />
      ))}
    </ScrollView>
  );
}
