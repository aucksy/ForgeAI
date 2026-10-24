/**
 * Settings → Units (redesign R6). v0.27.0 (tracker plan Phase 5): pounds and miles everywhere a
 * weight or a kilometre shows (stored metric as always; `lib/units.ts`); metre exercises stay in
 * metres. Release A, A9: the body figure moved to Your profile (it is about you, not a unit).
 */
import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card } from '@/components/ui';
import { useSettings } from '@/store/settingsStore';
import type { UnitSystem } from '@/types/models';

const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg, km' },
  { id: 'imperial', label: 'lb, miles' },
] as const satisfies readonly ChipOption<UnitSystem>[];

export default function UnitsPage() {
  const unitSystem = useSettings((s) => s.unitSystem);
  const setUnitSystem = useSettings((s) => s.setUnitSystem);
  return (
    <SettingsPage title="Units">
      <Card>
        <ChipGroup label="Units" options={UNIT_OPTIONS} selectedId={unitSystem} onSelect={setUnitSystem} />
      </Card>
    </SettingsPage>
  );
}