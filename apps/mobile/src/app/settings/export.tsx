/**
 * Settings → Export & import (redesign R6): Save full backup (0.55.2, R-123: the file MettleUp
 * restores), Save my history, Save my measurements, then Import from Hevy / Strong and Import routines.
 */
import { SaveHistoryCard, SaveMeasurementsCard } from '@/components/settings/BackupCard';
import { SaveFullBackupCard } from '@/components/settings/SaveFullBackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ImportCard } from '@/tracker/components/ImportCard';

export default function ExportPage() {
  return (
    <SettingsPage title="Export & import">
      <SaveFullBackupCard />
      <SaveHistoryCard />
      <SaveMeasurementsCard />
      <ImportCard />
    </SettingsPage>
  );
}
