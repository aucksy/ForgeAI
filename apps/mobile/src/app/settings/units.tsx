/**
 * Settings → Units (redesign R6). v0.27.0 (tracker plan Phase 5): pounds and miles everywhere a
 * weight or a kilometre shows (stored metric as always; `lib/units.ts`); metre exercises stay in
 * metres. v0.25.1: the body figure the body map and the share picture draw.
 */
import { Text } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card } from '@/components/ui';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';
import type { BodyFigure } from '@/tracker/catalog/bodyMapPaths';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import type { UnitSystem } from '@/types/models';

const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg, km' },
  { id: 'imperial', label: 'lb, miles' },
] as const satisfies readonly ChipOption<UnitSystem>[];

const FIGURE_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
] as const satisfies readonly ChipOption<BodyFigure>[];

export default function UnitsPage() {
  const unitSystem = useSettings((s) => s.unitSystem);
  const setUnitSystem = useSettings((s) => s.setUnitSystem);
  const bodyFigure = useTrackerPrefs((s) => s.bodyFigure);
  const setBodyFigure = useTrackerPrefs((s) => s.setBodyFigure);
  return (
    <SettingsPage title="Units">
      <Card>
        <ChipGroup label="Units" options={UNIT_OPTIONS} selectedId={unitSystem} onSelect={setUnitSystem} />
      </Card>
      <Card>
        <ChipGroup label="Body figure" options={FIGURE_OPTIONS} selectedId={bodyFigure} onSelect={setBodyFigure} />
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }}>
          The body drawn on Statistics and on share pictures.
        </Text>
      </Card>
    </SettingsPage>
  );
}
