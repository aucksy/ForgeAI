/**
 * Audit Phase 4 (point 6) — "Coming from Hevy or Strong?" Switchers are the most likely new
 * members, so the import is offered where they arrive: the welcome screen and an empty Home.
 *
 * The welcome screen shows before the app's screens exist, so there a tap only remembers the
 * choice (`choosePendingImport`); Home opens the import as soon as it first shows
 * (`takePendingImport`).
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Card, Chip, Icon } from '@/components/ui';
import { useAccount } from '@/store/accountStore';
import { color, space, type } from '@/theme/tokens';

import { switcherLine, type SwitchApp } from '../services/switcher';

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
  // R-598: "Everything stays on this phone." only when NOT signed in (a signed-in member's workouts
  // are copied to the MettleUp account). Until the account is read, the sentence stays hidden.
  const signedIn = useAccount((s) => !s.ready || s.account != null);
  useEffect(() => {
    if (useAccount.getState().ready) return;
    void useAccount
      .getState()
      .init()
      .catch((e: unknown) => console.warn('[switcher] could not read the account', e));
  }, []);
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="import" size={18} color={color.accent} />
        {/* UAT WP14 (run 39000428116, font 2.0 on 360 dp): beside the icon the heading must wrap,
            not run off the screen's edge. */}
        <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Coming from Hevy or Strong?</Text>
      </View>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 }}>
        {switcherLine({ later, selected, signedIn })}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label="From Hevy" icon={selected === 'hevy' ? 'check' : undefined} selected={selected === 'hevy'} onPress={() => onPick('hevy')} />
        <Chip label="From Strong" icon={selected === 'strong' ? 'check' : undefined} selected={selected === 'strong'} onPress={() => onPick('strong')} />
      </View>
    </Card>
  );
}
