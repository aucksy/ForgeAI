import { ScrollView } from 'react-native';

import { Chip } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { space } from '@/theme/tokens';

export interface SuggestedPromptsProps {
  onPrompt: (prompt: string) => void;
}

/** The PRD's 12 suggested prompts. */
const PROMPTS: { label: string; icon: IconName }[] = [
  { label: "Today's Workout", icon: 'dumbbell' },
  { label: 'Log Workout', icon: 'plus' },
  { label: 'Log Meal', icon: 'meal' },
  { label: 'Upload Food Photo', icon: 'camera' },
  { label: 'Show My Progress', icon: 'trend' },
  { label: 'Weekly Summary', icon: 'calendar' },
  { label: 'Monthly Summary', icon: 'chart' },
  { label: 'Show My PRs', icon: 'trophy' },
  { label: 'Nutrition Today', icon: 'flame' },
  { label: 'Calories Remaining', icon: 'zap' },
  { label: 'Protein Remaining', icon: 'target' },
  { label: 'What Should I Lift Today?', icon: 'sparkle' },
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
