/** Settings → Back up and restore → "Save a backup" (R-123): one file with everything, to the share sheet. */
import { SaveBackupPanel } from '@/components/settings/BackupFilePanels';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function SaveBackupPage() {
  return (
    <SettingsPage title="Save a backup">
      <SaveBackupPanel />
    </SettingsPage>
  );
}
