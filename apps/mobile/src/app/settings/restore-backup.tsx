/** Settings → Back up and restore → "Restore from a backup" (R-123): pick a file, see what is in it, then restore. */
import { RestoreBackupPanel } from '@/components/settings/BackupFilePanels';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function RestoreBackupPage() {
  return (
    <SettingsPage title="Restore from a backup">
      <RestoreBackupPanel />
    </SettingsPage>
  );
}
