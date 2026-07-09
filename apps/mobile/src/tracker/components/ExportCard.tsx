/** Settings card: export the full workout history to a shareable Excel (.xlsx) file. */
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { success } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';
import { exportWorkoutsXlsx } from '@/tracker/services/dataExport';

export function ExportCard() {
  const [busy, setBusy] = useState(false);

  const onExport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await exportWorkoutsXlsx();
      if (res.rowCount === 0) {
        Alert.alert('Nothing to export', 'Log a workout first, then export your data.');
      } else if (res.shared) {
        success();
      } else {
        Alert.alert('Export saved', `Saved ${res.rowCount} sets — but sharing isn’t available on this device.`);
      }
    } catch {
      Alert.alert('Export failed', 'Could not create the export file. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <GhostButton
        label={busy ? 'Exporting…' : 'Export workouts (Excel)'}
        icon="chart"
        onPress={() => void onExport()}
      />
      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.caption,
          color: color.inkMuted,
          textAlign: 'center',
          marginTop: space.md,
          lineHeight: 15,
        }}
      >
        Save every set to a spreadsheet you can open in Excel or Google Sheets.
      </Text>
    </Card>
  );
}
