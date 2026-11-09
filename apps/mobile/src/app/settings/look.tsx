/**
 * Settings → Light or dark (owner, 9 Nov 2026: "it should be system default"). Three choices:
 * "Same as phone" (the default: the app is light when the phone is light, dark when it is dark, and
 * follows it when it changes), "Light" and "Dark". A tap changes the whole app at once
 * (theme/appearance.ts); the choice is kept for the next launch (theme/lookChoice.ts).
 */
import { Text } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card } from '@/components/ui';
import { setLookChoice, useAppearance } from '@/theme/appearance';
import { LOOK_WORDS, type LookChoice } from '@/theme/lookChoice';
import { color, space, type } from '@/theme/tokens';

const LOOK_OPTIONS = [
  { id: 'system', label: LOOK_WORDS.system },
  { id: 'light', label: LOOK_WORDS.light },
  { id: 'dark', label: LOOK_WORDS.dark },
] as const satisfies readonly ChipOption<LookChoice>[];

/** The line under the choices. member-words */
export const LOOK_HINT = 'Same as phone: the app turns light or dark when your phone does.';

export default function LookPage() {
  const choice = useAppearance((s) => s.choice);
  return (
    <SettingsPage title="Light or dark">
      <Card>
        <ChipGroup label="Colours" options={LOOK_OPTIONS} selectedId={choice} onSelect={setLookChoice} />
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19, marginTop: space.md }}>
          {LOOK_HINT}
        </Text>
      </Card>
    </SettingsPage>
  );
}
