/**
 * Audit Phase 4 (point 6) — "Coming from Hevy or Strong?" Switchers are the most likely new
 * members, so the import is offered where they arrive: the welcome screen and an empty Home.
 *
 * The welcome screen shows before the app's screens exist, so there a tap only remembers the
 * choice (`choosePendingImport`); Home opens the import as soon as it first shows
 * (`takePendingImport`).
 */
import { Text, View } from 'react-native';

import { Card, Chip, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import type { SwitchApp } from '../services/switcher';

export { choosePendingImport, takePendingImport, type SwitchApp } from '../services/switcher';

/**
 * The card. `selected` marks the choice on the welcome screen ("right after you start");
 * on Home a tap opens the import at once.
 */
export function SwitcherCard({
  onPick,
  selected = null,
  later = false,
}: {
  onPick: (app: SwitchApp) => void;
  selected?: SwitchApp | null;
  /** Welcome: the import opens after "Start training". */
  later?: boolean;
}) {
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="calendar" size={18} color={color.accent} />
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Coming from Hevy or Strong?</Text>
      </View>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 }}>
        {later
          ? selected
            ? `Your ${selected === 'hevy' ? 'Hevy' : 'Strong'} workouts and routines come in right after you tap Start training.`
            : 'Bring your workouts, records and routines with you. Pick your app; it opens right after you start.'
          : 'Bring your workouts, records and routines with you. Everything stays on this phone.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label="From Hevy" icon={selected === 'hevy' ? 'check' : undefined} selected={selected === 'hevy'} onPress={() => onPick('hevy')} />
        <Chip label="From Strong" icon={selected === 'strong' ? 'check' : undefined} selected={selected === 'strong'} onPress={() => onPick('strong')} />
      </View>
    </Card>
  );
}
